/**
 * What coss.com tells people about a booking. Decided once, into outbox rows in the deciding
 * transaction: the core never branches on policy. Rows hold no content, so an email is rendered
 * when it's sent, and news that's gone stale (the booking moved or was cancelled) is dropped.
 *
 * Emails use fixed templates, with no customer HTML and no links but the manage link. That's what
 * lets them skip per-email content screening, which would send a patient's name to the AI Gateway:
 * what a customer can put in them is screened when it's set up instead (`screening.ts`).
 */
import { HipaaModeError } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import { type EmailBlock, type EmailContent, oneLine, renderEmail } from "@coss/email-layout";
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { decryptContact } from "./attendees.ts";
import { accentColors } from "./branding.ts";
import { buildIcs } from "./calendar/ical.ts";
import { withSessionLocation } from "./group-sessions.ts";
import { dateLocale, type MessageKey, messageLanguage, translator } from "./i18n.ts";
import { getLogoRow, LOGO_CONTENT_ID, type SchedulingLogoRow } from "./logo.ts";
import { createHostInvitationSession, createManageSession } from "./sessions.ts";
import type { SchedulingDeps } from "./types.ts";

const {
  environment,
  schedulingAttendee,
  schedulingBookingEvent,
  schedulingBooking,
  schedulingBookingHost,
  schedulingEventType,
  schedulingHost,
  schedulingNotification,
  schedulingSettings,
} = schema;

type BookingRow = typeof schedulingBooking.$inferSelect;
type NotificationRow = typeof schedulingNotification.$inferSelect;
type Policy = NonNullable<typeof schedulingSettings.$inferSelect.notifications>;

export type NotificationEvent =
  | "confirmed"
  | "pending_approval"
  | "rescheduled"
  | "cancelled"
  | "declined"
  | "reminder";

const DEFAULT_POLICY: Record<NotificationEvent, Policy[string]> = {
  confirmed: { emailAttendee: true, emailHost: true },
  pending_approval: { emailAttendee: true, emailHost: true },
  rescheduled: { emailAttendee: true, emailHost: true },
  cancelled: { emailAttendee: true, emailHost: true },
  declined: { emailAttendee: true },
  reminder: { emailAttendee: true },
};

const REMINDER_BEFORE_MS = 24 * 60 * 60_000;

/** Defaults, then the environment's choices, then the event type's. */
export function resolvePolicy(
  event: NotificationEvent,
  environmentPolicy: Policy | null | undefined,
  eventTypePolicy: Policy | null | undefined,
): Policy[string] {
  return {
    ...DEFAULT_POLICY[event],
    ...environmentPolicy?.[event],
    ...eventTypePolicy?.[event],
  };
}

type Branding = {
  settings: typeof schedulingSettings.$inferSelect | undefined;
  logo: SchedulingLogoRow | null;
};

/** The customer's branding only under their own address; coss.com's sends `cossHtml`. */
function renderMessage(branding: Branding, senderName: string, content: EmailContent) {
  const { settings, logo } = branding;
  const coss = renderEmail(content);
  if (!settings?.emailFrom) return { ...coss, cossHtml: coss.html, logo: null };
  const accent = settings.accentColor ? accentColors(settings.accentColor) : null;
  const branded = renderEmail({
    ...content,
    brand: oneLine(settings.brandName ?? "") || senderName,
    ...(logo
      ? { logo: { src: `cid:${LOGO_CONTENT_ID}`, width: logo.width, height: logo.height } }
      : {}),
    ...(accent ? { accent } : {}),
  });
  return { ...coss, html: branded.html, cossHtml: coss.html, logo: logo && emailLogo(logo) };
}

/** Inside the message, not a remote image: opening an email tells neither us nor the customer. */
function emailLogo(logo: SchedulingLogoRow): NonNullable<SchedulingEmail["logo"]> {
  return {
    filename: logo.contentType === "image/png" ? "logo.png" : "logo.jpg",
    content: logo.image.toString("base64"),
    contentType: logo.contentType,
    contentId: LOGO_CONTENT_ID,
  };
}

/**
 * Whether an attendee will be emailed once this event type's booking is confirmed: what the booker
 * promises them. An approval's outcome is the same `confirmed` email, so it covers requests too.
 */
export async function attendeeEmailedOnConfirm(
  env: { organizationId: string; environmentId: string },
  eventTypeId: string,
): Promise<boolean> {
  const policies = await policiesOf(db, { ...env, eventTypeId });
  return (
    resolvePolicy("confirmed", policies.environment, policies.eventType).emailAttendee === true
  );
}

async function policiesOf(
  tx: Executor,
  booking: Pick<BookingRow, "organizationId" | "environmentId" | "eventTypeId">,
) {
  const [settings] = await tx
    .select({ notifications: schedulingSettings.notifications })
    .from(schedulingSettings)
    .where(
      and(
        eq(schedulingSettings.organizationId, booking.organizationId),
        eq(schedulingSettings.environmentId, booking.environmentId),
      ),
    );
  const [eventType] = await tx
    .select({ notifications: schedulingEventType.notifications })
    .from(schedulingEventType)
    .where(
      and(
        eq(schedulingEventType.id, booking.eventTypeId),
        eq(schedulingEventType.organizationId, booking.organizationId),
      ),
    );
  return { environment: settings?.notifications, eventType: eventType?.notifications };
}

/** A change that doesn't touch a booking's time still bumps its version; its reminder still holds. */
export async function carryReminders(
  tx: Executor,
  booking: Pick<BookingRow, "id" | "organizationId" | "version">,
): Promise<void> {
  await tx
    .update(schedulingNotification)
    .set({ bookingVersion: booking.version })
    .where(
      and(
        eq(schedulingNotification.bookingId, booking.id),
        eq(schedulingNotification.organizationId, booking.organizationId),
        eq(schedulingNotification.kind, "reminder"),
        isNull(schedulingNotification.finishedAt),
        eq(schedulingNotification.bookingVersion, booking.version - 1),
      ),
    );
}

/** Queues what this change owes, in the transaction that decided it. A held booking owes nothing. */
export async function enqueueBookingNotifications(
  tx: Executor,
  booking: BookingRow,
  event: Exclude<NotificationEvent, "reminder">,
  now: Date,
): Promise<void> {
  const policies = await policiesOf(tx, booking);
  const rows: (typeof schedulingNotification.$inferInsert)[] = [];
  const add = (
    kind: NotificationEvent,
    channel: "email" | "sms",
    recipient: "attendee" | "host",
    dueAt: Date,
  ) => {
    rows.push({
      organizationId: booking.organizationId,
      environmentId: booking.environmentId,
      bookingId: booking.id,
      kind,
      channel,
      recipient,
      bookingVersion: booking.version,
      dedupeKey: `${kind}:${channel}:${recipient}:${booking.id}:${booking.version}`,
      dueAt,
    });
  };
  if (event === "rescheduled") {
    // Only the latest move is news: an unsent notice of an earlier one would say the same thing.
    await tx
      .update(schedulingNotification)
      .set({ finishedAt: now, outcome: "superseded", leaseUntil: null })
      .where(
        and(
          eq(schedulingNotification.bookingId, booking.id),
          eq(schedulingNotification.organizationId, booking.organizationId),
          eq(schedulingNotification.kind, "rescheduled"),
          isNull(schedulingNotification.finishedAt),
          lt(schedulingNotification.bookingVersion, booking.version),
        ),
      );
  }
  const policy = resolvePolicy(event, policies.environment, policies.eventType);
  if (policy.emailAttendee) add(event, "email", "attendee", now);
  if (policy.emailHost) add(event, "email", "host", now);
  if (policy.smsAttendee) add(event, "sms", "attendee", now);
  if (event === "confirmed" || event === "rescheduled") {
    const reminderAt = new Date(booking.startAt.getTime() - REMINDER_BEFORE_MS);
    if (reminderAt > now) {
      const reminder = resolvePolicy("reminder", policies.environment, policies.eventType);
      if (reminder.emailAttendee) add("reminder", "email", "attendee", reminderAt);
      if (reminder.smsAttendee) add("reminder", "sms", "attendee", reminderAt);
    }
  }
  if (rows.length > 0) await tx.insert(schedulingNotification).values(rows).onConflictDoNothing();
}

export type SchedulingEmail = {
  environment: {
    organizationId: string;
    projectId: string;
    environmentId: string;
    mode: "live" | "sandbox";
  };
  from: string | null;
  senderName: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** What coss.com's address sends, including when the customer's stops being verified. */
  cossHtml: string;
  ics: { filename: string; content: string; method: "REQUEST" | "CANCEL" } | null;
  /** Inline in `html`, so it goes only with that, never with `cossHtml`. */
  logo: { filename: string; content: string; contentType: string; contentId: string } | null;
  idempotencyKey: string;
  /** To someone who asked for nothing: goes from the customer's own address or not at all. */
  ownSenderOnly: boolean;
};

export type SchedulingSms = {
  environment: SchedulingEmail["environment"];
  from: string;
  to: string;
  body: string;
  idempotencyKey: string;
};

/** Sending goes through the email and SMS products, which this package can't import. */
export type SchedulingNotifier = {
  email(message: SchedulingEmail): Promise<void>;
  /** Absent without SMS. Throws if refused; an opted-out number is the product's to skip. */
  sms?(message: SchedulingSms): Promise<void>;
};

export type NotificationDeps = Pick<SchedulingDeps, "dataKeys" | "now"> & {
  notifier: SchedulingNotifier;
  /** `SCHEDULING_PUBLIC_URL`: where manage links go. Without it, emails have none. */
  publicUrl: string | null;
};

const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 6;
// How long a confirmation waits for a Meet or Teams link from the calendar write.
const MEETING_LINK_WAIT_MS = 2 * 60_000;
const MEETING_LINK_RETRY_MS = 15_000;

const formatWhen = (at: Date, timeZone: string, locale: string | null): string => {
  try {
    return new Intl.DateTimeFormat(dateLocale(locale), {
      timeZone,
      dateStyle: "full",
      timeStyle: "short",
    }).format(at);
  } catch {
    return `${at.toISOString()} UTC`;
  }
};

const titleOf = (booking: BookingRow) => oneLine(booking.title);

function locationLine(booking: BookingRow): string | null {
  const location = booking.location;
  if (!location) return null;
  if (location.type === "link" || location.type === "zoom") return location.url;
  if (location.type === "phone") return location.number;
  if (location.type === "in_person") return location.address;
  return null;
}

const SUBJECTS: Record<NotificationEvent, MessageKey> = {
  confirmed: "subject_confirmed",
  pending_approval: "subject_pending_approval",
  rescheduled: "subject_rescheduled",
  cancelled: "subject_cancelled",
  declined: "subject_declined",
  reminder: "subject_reminder",
};

// Guests hear nothing until there's something to come to, so they have no line for two of these.
const LEADS: Record<
  NotificationEvent,
  { attendee: MessageKey; host: MessageKey; guest: MessageKey | null }
> = {
  confirmed: {
    attendee: "lead_confirmed_attendee",
    host: "lead_confirmed_host",
    guest: "lead_confirmed_guest",
  },
  pending_approval: {
    attendee: "lead_pending_approval_attendee",
    host: "lead_pending_approval_host",
    guest: null,
  },
  rescheduled: {
    attendee: "lead_rescheduled_attendee",
    host: "lead_rescheduled_host",
    guest: "lead_rescheduled_guest",
  },
  cancelled: {
    attendee: "lead_cancelled_attendee",
    host: "lead_cancelled_host",
    guest: "lead_cancelled_guest",
  },
  declined: { attendee: "lead_declined_attendee", host: "lead_declined_host", guest: null },
  reminder: { attendee: "lead_reminder", host: "lead_reminder", guest: "lead_reminder" },
};

/** Whether a guest has heard of this booking, or has any reason to hear about it now. */
async function guestsAreTold(booking: BookingRow, event: NotificationEvent): Promise<boolean> {
  if (event === "pending_approval" || event === "declined") return false;
  if (event !== "cancelled") return booking.status === "confirmed";
  const [confirmed] = await db
    .select({ id: schedulingBookingEvent.bookingId })
    .from(schedulingBookingEvent)
    .where(
      and(
        eq(schedulingBookingEvent.bookingId, booking.id),
        eq(schedulingBookingEvent.organizationId, booking.organizationId),
        eq(schedulingBookingEvent.type, "scheduling.booking.confirmed"),
      ),
    )
    .limit(1);
  return Boolean(confirmed);
}

type Claimed = NotificationRow;

async function claimDue(now: Date, opts: Scan): Promise<Claimed[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(schedulingNotification)
      .where(
        and(
          isNull(schedulingNotification.finishedAt),
          lte(schedulingNotification.dueAt, now),
          or(isNull(schedulingNotification.leaseUntil), lt(schedulingNotification.leaseUntil, now)),
          opts.scope
            ? inArray(schedulingNotification.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .orderBy(asc(schedulingNotification.dueAt))
      .limit(opts.limit ?? 50)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    await tx
      .update(schedulingNotification)
      .set({
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        attempts: sql`${schedulingNotification.attempts} + 1`,
      })
      .where(
        inArray(
          schedulingNotification.id,
          due.map((row) => row.id),
        ),
      );
    return due;
  });
}

type Scan = { limit?: number; scope?: { organizationIds: readonly string[] } };

async function finish(row: Claimed, outcome: string, now: Date): Promise<void> {
  await db
    .update(schedulingNotification)
    .set({ finishedAt: now, outcome, leaseUntil: null })
    .where(eq(schedulingNotification.id, row.id));
}

/** Whether this is old news: the booking changed since, or was cancelled before its reminder. */
function isStale(row: Claimed, booking: BookingRow): boolean {
  const ended = booking.status === "cancelled" || booking.status === "declined";
  if (row.kind === "cancelled" || row.kind === "declined") return !ended;
  if (ended) return true;
  if (row.kind === "pending_approval") return booking.status !== "pending_approval";
  if (row.kind === "reminder") {
    return booking.status !== "confirmed" || row.bookingVersion !== booking.version;
  }
  return false;
}

async function environmentOf(row: Claimed): Promise<SchedulingEmail["environment"] | null> {
  const [found] = await db
    .select({ projectId: environment.projectId, mode: environment.mode })
    .from(environment)
    .where(
      and(
        eq(environment.id, row.environmentId),
        eq(environment.organizationId, row.organizationId),
      ),
    );
  if (!found) return null;
  return {
    organizationId: row.organizationId,
    projectId: found.projectId,
    environmentId: row.environmentId,
    mode: found.mode,
  };
}

async function settingsOf(row: Claimed) {
  const [settings] = await db
    .select()
    .from(schedulingSettings)
    .where(
      and(
        eq(schedulingSettings.organizationId, row.organizationId),
        eq(schedulingSettings.environmentId, row.environmentId),
      ),
    );
  return settings;
}

async function brandingOf(row: Claimed): Promise<Branding> {
  const settings = await settingsOf(row);
  return { settings, logo: settings?.emailFrom ? await getLogoRow(row) : null };
}

async function sendBookingEmail(
  row: Claimed,
  booking: BookingRow,
  deps: NotificationDeps,
  now: Date,
): Promise<"sent" | "no_address"> {
  const env = await environmentOf(row);
  if (!env) return "no_address";
  const branding = await brandingOf(row);
  const { settings } = branding;
  const event = row.kind as NotificationEvent;
  const senderName = oneLine(settings?.brandName ?? titleOf(booking));
  const when = async (timeZone: string, locale: string | null) =>
    formatWhen(booking.startAt, timeZone, locale);
  const uid = `${booking.id}@coss.com`;
  const icsMethod =
    event === "cancelled" || event === "declined" ? ("CANCEL" as const) : ("REQUEST" as const);
  const ics = (to: { name: string | null; email: string }) => ({
    filename: "booking.ics",
    method: icsMethod,
    content: buildIcs({
      uid,
      title: titleOf(booking),
      startMs: booking.startAt.getTime(),
      endMs: booking.endAt.getTime(),
      stampMs: now.getTime(),
      sequence: booking.version,
      method: icsMethod,
      location: locationLine(booking),
      attendee: to,
    }),
  });
  // Nothing goes on a calendar until it's approved, even if it moved while waiting.
  const withIcs =
    event === "cancelled" ||
    event === "declined" ||
    ((event === "confirmed" || event === "rescheduled") && booking.status === "confirmed");
  const key = `scheduling:${row.id}`;

  if (row.recipient === "attendee") {
    const attendees = await db
      .select()
      .from(schedulingAttendee)
      .where(
        and(
          eq(schedulingAttendee.bookingId, booking.id),
          eq(schedulingAttendee.organizationId, booking.organizationId),
        ),
      );
    // A guest is an address someone typed, who asked for nothing: never coss.com's own sender.
    const toldGuests =
      (env.mode === "sandbox" || Boolean(settings?.emailFrom)) &&
      (await guestsAreTold(booking, event));
    let sent = false;
    for (const attendee of attendees) {
      const guest = attendee.role === "guest";
      if (guest && !toldGuests) continue;
      const contact = decryptContact(attendee.encryptedContact, deps);
      if (!contact.email) continue;
      // A fresh link per email: its token can't be recovered, and a body isn't kept. The booking
      // is the attendee's to change, so a guest gets none.
      const manage =
        !guest && deps.publicUrl && event !== "cancelled" && event !== "declined"
          ? await createManageSession(env, {
              bookingId: booking.id,
              publicUrl: deps.publicUrl,
              now,
            })
          : null;
      const t = translator(attendee.locale);
      const lead = guest ? LEADS[event].guest : LEADS[event].attendee;
      const blocks: EmailBlock[] = [
        { paragraph: lead ? t(lead) : "" },
        {
          details: [
            { label: t("label_what"), value: titleOf(booking) },
            { label: t("label_when"), value: await when(attendee.timeZone, attendee.locale) },
            ...(locationLine(booking)
              ? [{ label: t("label_where"), value: locationLine(booking) as string }]
              : []),
          ],
        },
        ...(manage?.url
          ? [{ button: { label: t("button_manage"), url: manage.url } } as EmailBlock]
          : []),
      ];
      const message = renderMessage(branding, senderName, {
        lang: messageLanguage(attendee.locale),
        subject: t(SUBJECTS[event], { title: titleOf(booking) }),
        blocks,
        reason: t(guest ? "reason_guest" : "reason_attendee", { sender: senderName }),
      });
      await deps.notifier.email({
        environment: env,
        from: settings?.emailFrom ?? null,
        senderName,
        to: contact.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
        cossHtml: message.cossHtml,
        ics: withIcs ? ics({ name: contact.name, email: contact.email }) : null,
        logo: message.logo,
        idempotencyKey: `${key}:${attendee.id}`,
        ownSenderOnly: guest,
      });
      sent = true;
    }
    return sent ? "sent" : "no_address";
  }

  const hosts = await db
    .select({
      email: schedulingHost.email,
      name: schedulingHost.name,
      timeZone: schedulingHost.timeZone,
      locale: schedulingHost.locale,
      id: schedulingHost.id,
    })
    .from(schedulingBookingHost)
    .innerJoin(schedulingHost, eq(schedulingHost.id, schedulingBookingHost.hostId))
    .where(
      and(
        eq(schedulingBookingHost.bookingId, booking.id),
        eq(schedulingBookingHost.organizationId, booking.organizationId),
      ),
    );
  let sent = false;
  for (const host of hosts) {
    if (!host.email) continue;
    const t = translator(host.locale);
    const blocks: EmailBlock[] = [
      { paragraph: t(LEADS[event].host) },
      {
        details: [
          { label: t("label_what"), value: titleOf(booking) },
          { label: t("label_when"), value: await when(host.timeZone, host.locale) },
          ...(locationLine(booking)
            ? [{ label: t("label_where"), value: locationLine(booking) as string }]
            : []),
        ],
      },
    ];
    const message = renderMessage(branding, senderName, {
      lang: messageLanguage(host.locale),
      subject: t(SUBJECTS[event], { title: titleOf(booking) }),
      blocks,
      reason: t("reason_host", { sender: senderName }),
    });
    await deps.notifier.email({
      environment: env,
      from: settings?.emailFrom ?? null,
      senderName,
      to: host.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      cossHtml: message.cossHtml,
      ics: withIcs ? ics({ name: host.name, email: host.email }) : null,
      logo: message.logo,
      idempotencyKey: `${key}:${host.id}`,
      ownSenderOnly: false,
    });
    sent = true;
  }
  return sent ? "sent" : "no_address";
}

async function sendBookingSms(
  row: Claimed,
  booking: BookingRow,
  deps: NotificationDeps,
): Promise<"sent" | "no_address" | "no_sender"> {
  const env = await environmentOf(row);
  const settings = await settingsOf(row);
  if (!env) return "no_address";
  if (!settings?.smsFrom || !deps.notifier.sms) return "no_sender";
  const attendees = await db
    .select()
    .from(schedulingAttendee)
    .where(
      and(
        eq(schedulingAttendee.bookingId, booking.id),
        eq(schedulingAttendee.organizationId, booking.organizationId),
      ),
    );
  let sent = false;
  const event = row.kind as NotificationEvent;
  for (const attendee of attendees) {
    const contact = decryptContact(attendee.encryptedContact, deps);
    if (!contact.phone) continue;
    const t = translator(attendee.locale);
    const brand = oneLine(settings.brandName ?? t("sms_brand_fallback"));
    try {
      await deps.notifier.sms({
        environment: env,
        from: settings.smsFrom,
        to: contact.phone,
        body: `${brand}: ${t(SUBJECTS[event], { title: titleOf(booking) })}, ${formatWhen(booking.startAt, attendee.timeZone, attendee.locale)}. ${t("sms_opt_out")}`,
        idempotencyKey: `scheduling:${row.id}:${attendee.id}`,
      });
    } catch (error) {
      // A number HIPAA mode can't text won't become one on a retry.
      if (error instanceof HipaaModeError) continue;
      throw error;
    }
    sent = true;
  }
  return sent ? "sent" : "no_address";
}

async function sendHostNews(row: Claimed, deps: NotificationDeps, now: Date): Promise<string> {
  const env = await environmentOf(row);
  if (!env || !row.hostId) return "no_address";
  const [host] = await db
    .select()
    .from(schedulingHost)
    .where(
      and(eq(schedulingHost.id, row.hostId), eq(schedulingHost.organizationId, row.organizationId)),
    );
  if (!host?.email) return "no_address";
  const branding = await brandingOf(row);
  const { settings } = branding;
  const t = translator(host.locale);
  const senderName = oneLine(settings?.brandName ?? t("sender_fallback"));
  const session = deps.publicUrl
    ? await createHostInvitationSession(env, host.id, deps.publicUrl, now)
    : null;
  const zoom = row.kind === "zoom_needs_reauth";
  const message = renderMessage(branding, senderName, {
    lang: messageLanguage(host.locale),
    subject: t(zoom ? "zoom_subject" : "calendar_subject"),
    blocks: [
      { paragraph: t(zoom ? "zoom_body" : "calendar_body") },
      ...(session?.url
        ? [
            {
              button: {
                label: t(zoom ? "zoom_button" : "calendar_button"),
                url: session.url,
              },
            } as EmailBlock,
          ]
        : [{ paragraph: t("reconnect_through", { sender: senderName }) } as EmailBlock]),
    ],
    reason: t("reason_host", { sender: senderName }),
  });
  await deps.notifier.email({
    environment: env,
    from: settings?.emailFrom ?? null,
    senderName,
    to: host.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    cossHtml: message.cossHtml,
    ics: null,
    logo: message.logo,
    idempotencyKey: `scheduling:${row.id}`,
    ownSenderOnly: false,
  });
  return "sent";
}

/** Sends what's due. Returns how many were claimed, so a full batch runs again at once. */
export async function runDueSchedulingNotifications(
  deps: NotificationDeps,
  opts: Scan = {},
): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const due = await claimDue(now, opts);
  for (const row of due) {
    try {
      if (!row.bookingId) {
        await finish(row, await sendHostNews(row, deps, now), now);
        continue;
      }
      const [found] = await db
        .select()
        .from(schedulingBooking)
        .where(
          and(
            eq(schedulingBooking.id, row.bookingId),
            eq(schedulingBooking.organizationId, row.organizationId),
          ),
        );
      // Claimed a while ago, maybe: carried forward or superseded since.
      const [current] = await db
        .select({
          bookingVersion: schedulingNotification.bookingVersion,
          finishedAt: schedulingNotification.finishedAt,
        })
        .from(schedulingNotification)
        .where(eq(schedulingNotification.id, row.id));
      if (!current || current.finishedAt) continue;
      if (!found || isStale({ ...row, bookingVersion: current.bookingVersion }, found)) {
        await finish(row, "stale", now);
        continue;
      }
      const booking = await withSessionLocation(db, found);
      // A Meet, Teams or Zoom link appears only after the write: a confirmation gives it a moment,
      // then goes without. The manage page always shows the link once it exists.
      const waitingForLink =
        (booking.location?.type === "google_meet" ||
          booking.location?.type === "microsoft_teams" ||
          (booking.location?.type === "zoom" && !booking.location.url)) &&
        row.kind !== "cancelled" &&
        now.getTime() - booking.updatedAt.getTime() < MEETING_LINK_WAIT_MS;
      if (waitingForLink) {
        await db
          .update(schedulingNotification)
          .set({
            dueAt: new Date(now.getTime() + MEETING_LINK_RETRY_MS),
            leaseUntil: null,
            attempts: sql`${schedulingNotification.attempts} - 1`,
          })
          .where(eq(schedulingNotification.id, row.id));
        continue;
      }
      const outcome =
        row.channel === "email"
          ? await sendBookingEmail(row, booking, deps, now)
          : await sendBookingSms(row, booking, deps);
      await finish(row, outcome, now);
    } catch (error) {
      console.error("[scheduling] a notification failed:", error);
      if (row.attempts + 1 >= MAX_ATTEMPTS) {
        await finish(row, "failed", now);
      } else {
        await db
          .update(schedulingNotification)
          .set({
            dueAt: new Date(now.getTime() + 30_000 * 2 ** row.attempts),
            leaseUntil: null,
          })
          .where(eq(schedulingNotification.id, row.id));
      }
    }
  }
  return due.length;
}
