/**
 * What coss.com tells people about a booking. Decided once, into outbox rows in the deciding
 * transaction: the core never branches on policy. Rows hold no content, so an email is rendered
 * when it's sent, and news that's gone stale (the booking moved or was cancelled) is dropped.
 *
 * Emails use fixed templates, with no customer HTML and no links but the manage link. That's what
 * lets them skip per-email content screening, which would send a patient's name to the AI Gateway:
 * what a customer can put in them is screened when it's set up instead (`screening.ts`). A reminder
 * can carry the customer's own words and one button on their verified domain (`reminders.ts`), but
 * never under coss.com's address: `cossHtml`, `cossSubject` and `cossText` are always fixed copy.
 */
import { HipaaModeError } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import { type EmailBlock, type EmailContent, oneLine, renderEmail } from "@coss/email-layout";
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { decryptContact } from "./attendees.ts";
import { recordChange } from "./booking-record.ts";
import { accentColors } from "./branding.ts";
import { buildIcs } from "./calendar/ical.ts";
import { SchedulingError } from "./errors.ts";
import { withSessionLocation } from "./group-sessions.ts";
import { getLogoRow, LOGO_CONTENT_ID, type SchedulingLogoRow } from "./logo.ts";
import { type NotificationEvent, policiesOf, resolvePolicy } from "./notification-policy.ts";
import {
  type CopyKind,
  firstNameOf,
  STANDARD_LEADS as LEADS,
  type ReminderValues,
  reminderCopyKind,
  renderReminderCopy,
  STANDARD_SUBJECTS as SUBJECTS,
  safeName,
  timeUntil,
} from "./reminder-copy.ts";
import {
  effectiveRules,
  hasCustomEmail,
  isRuleRowStale,
  offsetOf,
  queueRulesOfAnchor,
  type ReminderRule,
  reconcileReminders,
  ruleVerdict,
  supersedeOnEnd,
  withinCossAllowance,
} from "./reminders.ts";
import type { BookingNotificationObjectOutput } from "./schemas.ts";
import { createHostInvitationSession, createManageSession } from "./sessions.ts";
import type { SchedulingDeps, SchedulingEnvironment } from "./types.ts";

export { type NotificationEvent, resolvePolicy } from "./notification-policy.ts";

const {
  environment,
  schedulingAttendee,
  schedulingBooking,
  schedulingBookingHost,
  schedulingHost,
  schedulingNotification,
  schedulingSettings,
} = schema;

type BookingRow = typeof schedulingBooking.$inferSelect;
type NotificationRow = typeof schedulingNotification.$inferSelect;
type Branding = {
  settings: typeof schedulingSettings.$inferSelect | undefined;
  logo: SchedulingLogoRow | null;
};

/**
 * The customer's branding only under their own address; coss.com's sends the `coss*` fields, and
 * `fixed` if there is one: what a customer wrote stays out of them.
 */
function renderMessage(
  branding: Branding,
  senderName: string,
  content: EmailContent,
  fixed: EmailContent = content,
) {
  const { settings, logo } = branding;
  const plain = renderEmail(content);
  const coss = renderEmail(fixed);
  const cossFields = { cossHtml: coss.html, cossSubject: coss.subject, cossText: coss.text };
  if (!settings?.emailFrom) return { ...plain, ...cossFields, logo: null };
  const accent = settings.accentColor ? accentColors(settings.accentColor) : null;
  const branded = renderEmail({
    ...content,
    brand: oneLine(settings.brandName ?? "") || senderName,
    ...(logo
      ? { logo: { src: `cid:${LOGO_CONTENT_ID}`, width: logo.width, height: logo.height } }
      : {}),
    ...(accent ? { accent } : {}),
  });
  return { ...plain, ...cossFields, html: branded.html, logo: logo && emailLogo(logo) };
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

/** Queues what this change owes, in the transaction that decided it. A held booking owes nothing. */
export async function enqueueBookingNotifications(
  tx: Executor,
  booking: BookingRow,
  event: Exclude<NotificationEvent, "reminder">,
  now: Date,
): Promise<void> {
  const policies = await policiesOf(tx, booking);
  const rows: (typeof schedulingNotification.$inferInsert)[] = [];
  const add = (channel: "email" | "sms", recipient: "attendee" | "host") => {
    rows.push({
      organizationId: booking.organizationId,
      environmentId: booking.environmentId,
      bookingId: booking.id,
      kind: event,
      channel,
      recipient,
      bookingVersion: booking.version,
      dedupeKey: `${event}:${channel}:${recipient}:${booking.id}:${booking.version}`,
      dueAt: now,
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
          or(
            eq(schedulingNotification.kind, "rescheduled"),
            eq(schedulingNotification.reminderAnchor, "rescheduled"),
          ),
          isNull(schedulingNotification.finishedAt),
          lt(schedulingNotification.bookingVersion, booking.version),
        ),
      );
  }
  const policy = resolvePolicy(event, policies.environment, policies.eventType);
  if (policy.emailAttendee) add("email", "attendee");
  if (policy.emailHost) add("email", "host");
  if (policy.smsAttendee) add("sms", "attendee");
  if (rows.length > 0) await tx.insert(schedulingNotification).values(rows).onConflictDoNothing();
  const rules = effectiveRules(policies);
  await queueRulesOfAnchor(tx, booking, rules, event, now);
  if (event === "cancelled" || event === "declined") await supersedeOnEnd(tx, booking, now);
  if ((event === "confirmed" || event === "rescheduled") && booking.status === "confirmed") {
    await reconcileReminders(tx, booking, rules, now, { newBooking: true });
  }
}

/** What marking a no-show owes: its own rules, whatever else the booking has queued. */
export async function enqueueNoShowReminders(
  tx: Executor,
  booking: BookingRow,
  now: Date,
): Promise<void> {
  await queueRulesOfAnchor(
    tx,
    booking,
    effectiveRules(await policiesOf(tx, booking)),
    "no_show",
    now,
  );
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
  cossSubject: string;
  cossText: string;
  cossHtml: string;
  /** Only under the customer's own address. */
  replyTo: string | null;
  ics: { filename: string; content: string; method: "REQUEST" | "CANCEL" } | null;
  /** Inline in `html`, so it goes only with that, never with `cossHtml`. */
  logo: { filename: string; content: string; contentType: string; contentId: string } | null;
  idempotencyKey: string;
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
    return new Intl.DateTimeFormat(locale ?? "en-US", {
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

function copyKindOf(row: Claimed, rule: ReminderRule | null): CopyKind {
  return rule ? reminderCopyKind(rule) : (row.kind as CopyKind);
}

const isEnded = (booking: Pick<BookingRow, "status">) =>
  booking.status === "cancelled" || booking.status === "declined";

const formatDate = (at: Date, timeZone: string, locale: string | null): string => {
  try {
    return new Intl.DateTimeFormat(locale ?? "en-US", { timeZone, dateStyle: "full" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
};

const formatTime = (at: Date, timeZone: string, locale: string | null): string => {
  try {
    return new Intl.DateTimeFormat(locale ?? "en-US", { timeZone, timeStyle: "short" }).format(at);
  } catch {
    return `${at.toISOString().slice(11, 16)} UTC`;
  }
};

/** The names in the copy are only what the email's recipient may already see of the booking. */
function reminderValues(input: {
  booking: BookingRow;
  brand: string;
  timeZone: string;
  locale: string | null;
  attendeeName: string | null;
  hostName: string | null;
  now: Date;
}): ReminderValues {
  const { booking, timeZone, locale } = input;
  const attendeeName = safeName(input.attendeeName);
  return {
    event_title: titleOf(booking),
    brand: input.brand,
    booking_id: booking.id,
    location: locationLine(booking) ?? "",
    time_until: timeUntil(booking.startAt.getTime(), input.now.getTime()),
    date: formatDate(booking.startAt, timeZone, locale),
    time: formatTime(booking.startAt, timeZone, locale),
    end_time: formatTime(booking.endAt, timeZone, locale),
    time_zone: timeZone,
    attendee_name: attendeeName || "there",
    attendee_first_name: firstNameOf(attendeeName) || "there",
    host_name: oneLine(input.hostName ?? "") || "your host",
  };
}

const paragraphsOf = (text: string): EmailBlock[] =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({ paragraph }));

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
  if (row.kind === "reminder" || row.kind === "started" || row.kind === "ended") {
    return isRuleRowStale(row, booking);
  }
  const ended = isEnded(booking);
  if (row.kind === "cancelled" || row.kind === "declined") return !ended;
  if (ended) return true;
  if (row.kind === "pending_approval") return booking.status !== "pending_approval";
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

async function bookingHosts(booking: BookingRow) {
  return db
    .select({
      email: schedulingHost.email,
      phone: schedulingHost.phone,
      name: schedulingHost.name,
      timeZone: schedulingHost.timeZone,
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
}

async function bookingAttendees(booking: BookingRow) {
  return db
    .select()
    .from(schedulingAttendee)
    .where(
      and(
        eq(schedulingAttendee.bookingId, booking.id),
        eq(schedulingAttendee.organizationId, booking.organizationId),
      ),
    );
}

const hostNamesOf = (hosts: readonly { name: string }[]) =>
  hosts.map((host) => host.name).join(", ");

async function sendBookingEmail(
  row: Claimed,
  booking: BookingRow,
  deps: NotificationDeps,
  now: Date,
  rule: ReminderRule | null,
): Promise<"sent" | "no_address"> {
  const env = await environmentOf(row);
  if (!env) return "no_address";
  const branding = await brandingOf(row);
  const { settings } = branding;
  const copyKind = copyKindOf(row, rule);
  const senderName = oneLine(settings?.brandName ?? titleOf(booking));
  const uid = `${booking.id}@coss.com`;
  const icsMethod = isEnded(booking) ? ("CANCEL" as const) : ("REQUEST" as const);
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
  const withIcs = rule
    ? rule.include_invite && (isEnded(booking) || booking.status === "confirmed")
    : copyKind === "cancelled" ||
      copyKind === "declined" ||
      ((copyKind === "confirmed" || copyKind === "rescheduled") && booking.status === "confirmed");
  const key = `scheduling:${row.id}`;
  const custom = rule && hasCustomEmail(rule) && settings?.emailFrom ? rule : null;
  const replyTo = settings?.emailFrom ? (settings.emailReplyTo ?? null) : null;
  const where = locationLine(booking);
  const details = (whenText: string): EmailBlock => ({
    details: [
      { label: "What", value: titleOf(booking) },
      { label: "When", value: whenText },
      ...(where ? [{ label: "Where", value: where }] : []),
    ],
  });

  /** The customer's words if they wrote any, and the standard ones for coss.com's address. */
  const content = (input: {
    audience: "attendee" | "host";
    values: ReminderValues;
    whenText: string;
    manageUrl: string | null;
    reason: string;
  }): { content: EmailContent; fixed: EmailContent } => {
    const manageButton: EmailBlock[] = input.manageUrl
      ? [{ button: { label: "Reschedule or cancel", url: input.manageUrl } }]
      : [];
    const standard = LEADS[copyKind][input.audience];
    const subject = SUBJECTS[copyKind](titleOf(booking));
    const fixed: EmailContent = {
      subject,
      blocks: [{ paragraph: standard }, details(input.whenText), ...manageButton],
      reason: input.reason,
    };
    if (!custom) return { content: fixed, fixed };
    const render = (text: string) => renderReminderCopy(text, input.values);
    return {
      fixed,
      content: {
        subject: custom.subject ? render(custom.subject) : subject,
        blocks: [
          ...(custom.message ? paragraphsOf(render(custom.message)) : [{ paragraph: standard }]),
          details(input.whenText),
          ...(custom.button
            ? [
                {
                  button: {
                    label: render(custom.button.label),
                    url: render(custom.button.url),
                  },
                } as EmailBlock,
                // One button to an email: the manage link becomes the secondary one.
                ...(input.manageUrl
                  ? [
                      {
                        link: { label: "Reschedule or cancel", url: input.manageUrl },
                      } as EmailBlock,
                    ]
                  : []),
              ]
            : manageButton),
        ],
        reason: input.reason,
      },
    };
  };

  const hosts = await bookingHosts(booking);

  if (row.recipient === "attendee") {
    let sent = false;
    for (const attendee of await bookingAttendees(booking)) {
      const contact = decryptContact(attendee.encryptedContact, deps);
      if (!contact.email) continue;
      // Only while it can still be changed. A fresh link per email: its token can't be recovered,
      // and a body isn't kept.
      const changeable = !isEnded(booking) && (!rule || booking.startAt > now);
      const manage =
        deps.publicUrl && changeable
          ? await createManageSession(env, {
              bookingId: booking.id,
              publicUrl: deps.publicUrl,
              now,
            })
          : null;
      const message = content({
        audience: "attendee",
        whenText: formatWhen(booking.startAt, attendee.timeZone, attendee.locale),
        manageUrl: manage?.url ?? null,
        reason: `You're receiving this because of your booking with ${senderName}.`,
        values: reminderValues({
          booking,
          brand: senderName,
          timeZone: attendee.timeZone,
          locale: attendee.locale,
          attendeeName: contact.name,
          hostName: hostNamesOf(hosts),
          now,
        }),
      });
      const rendered = renderMessage(branding, senderName, message.content, message.fixed);
      await deps.notifier.email({
        environment: env,
        from: settings?.emailFrom ?? null,
        senderName,
        to: contact.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        cossSubject: rendered.cossSubject,
        cossText: rendered.cossText,
        cossHtml: rendered.cossHtml,
        replyTo,
        ics: withIcs ? ics({ name: contact.name, email: contact.email }) : null,
        logo: rendered.logo,
        idempotencyKey: `${key}:${attendee.id}`,
      });
      sent = true;
    }
    return sent ? "sent" : "no_address";
  }

  // Hosts and fixed addresses read about the booking's first attendee, in the host's time zone.
  const attendees = custom ? await bookingAttendees(booking) : [];
  const firstAttendee = attendees[0];
  const attendeeName = firstAttendee
    ? decryptContact(firstAttendee.encryptedContact, deps).name
    : null;
  const staffRecipients =
    row.recipient === "host"
      ? hosts.flatMap((host) =>
          host.email
            ? [{ id: host.id, email: host.email, name: host.name, timeZone: host.timeZone }]
            : [],
        )
      : (rule?.email_to ?? []).map((email, index) => ({
          id: `to${index}`,
          email,
          name: null,
          timeZone: hosts[0]?.timeZone ?? "UTC",
        }));
  let sent = false;
  for (const recipient of staffRecipients) {
    const message = content({
      audience: "host",
      whenText: formatWhen(booking.startAt, recipient.timeZone, null),
      manageUrl: null,
      reason:
        row.recipient === "host"
          ? `You're receiving this as a host with ${senderName}.`
          : `You're receiving this about a booking with ${senderName}.`,
      values: reminderValues({
        booking,
        brand: senderName,
        timeZone: recipient.timeZone,
        locale: null,
        attendeeName,
        hostName: recipient.name ?? hostNamesOf(hosts),
        now,
      }),
    });
    const rendered = renderMessage(branding, senderName, message.content, message.fixed);
    await deps.notifier.email({
      environment: env,
      from: settings?.emailFrom ?? null,
      senderName,
      to: recipient.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      cossSubject: rendered.cossSubject,
      cossText: rendered.cossText,
      cossHtml: rendered.cossHtml,
      replyTo,
      ics: withIcs ? ics({ name: recipient.name, email: recipient.email }) : null,
      logo: rendered.logo,
      idempotencyKey: `${key}:${recipient.id}`,
    });
    sent = true;
  }
  return sent ? "sent" : "no_address";
}

async function sendBookingSms(
  row: Claimed,
  booking: BookingRow,
  deps: NotificationDeps,
  now: Date,
  rule: ReminderRule | null,
): Promise<"sent" | "no_address" | "no_sender"> {
  const env = await environmentOf(row);
  const settings = await settingsOf(row);
  if (!env) return "no_address";
  if (!settings?.smsFrom || !deps.notifier.sms) return "no_sender";
  const send = deps.notifier.sms;
  const smsFrom = settings.smsFrom;
  const brand = oneLine(settings.brandName ?? "Your booking");
  const copyKind = copyKindOf(row, rule);
  const recipients =
    row.recipient === "host"
      ? (await bookingHosts(booking)).flatMap((host) =>
          host.phone
            ? [{ id: host.id, phone: host.phone, timeZone: host.timeZone, locale: null }]
            : [],
        )
      : (await bookingAttendees(booking)).flatMap((attendee) => {
          const { phone } = decryptContact(attendee.encryptedContact, deps);
          return phone
            ? [{ id: attendee.id, phone, timeZone: attendee.timeZone, locale: attendee.locale }]
            : [];
        });
  let sent = false;
  for (const recipient of recipients) {
    // `sms_message` can't name anyone: refused when it's saved, and empty here.
    const words = rule?.sms_message
      ? renderReminderCopy(
          rule.sms_message,
          reminderValues({
            booking,
            brand,
            timeZone: recipient.timeZone,
            locale: recipient.locale,
            attendeeName: null,
            hostName: null,
            now,
          }),
        )
      : `${SUBJECTS[copyKind](titleOf(booking))}, ${formatWhen(booking.startAt, recipient.timeZone, recipient.locale)}.`;
    try {
      await send({
        environment: env,
        from: smsFrom,
        to: recipient.phone,
        body: `${brand}: ${oneLine(words)} Reply STOP to opt out.`,
        idempotencyKey: `scheduling:${row.id}:${recipient.id}`,
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

/**
 * A webhook row reports in one transaction with finishing the row: two workers holding it can't both
 * report. The booking's locked first, like everything else that touches these rows.
 */
export async function sendTimedWebhook(
  row: { id: string; bookingId: string | null; organizationId: string },
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(schedulingBooking)
      .where(
        and(
          eq(schedulingBooking.id, row.bookingId as string),
          eq(schedulingBooking.organizationId, row.organizationId),
        ),
      )
      .for("update");
    const [current] = await tx
      .select()
      .from(schedulingNotification)
      .where(eq(schedulingNotification.id, row.id))
      .for("update");
    if (!current || current.finishedAt) return;
    const finish = async (outcome: string) => {
      await tx
        .update(schedulingNotification)
        .set({ finishedAt: now, outcome, leaseUntil: null })
        .where(eq(schedulingNotification.id, row.id));
    };
    if (!booking || isStale(current, booking)) return finish("stale");
    const actor = { kind: "system" } as const;
    if (current.kind === "started" || current.kind === "ended") {
      await recordChange(tx, booking, {
        type: `scheduling.booking.${current.kind}`,
        webhook: `scheduling.booking.${current.kind}`,
        actor,
        occurredAt: now,
        momentAt: current.anchorAt ?? now,
        message: current.kind === "started" ? "Booking started" : "Booking ended",
      });
      return finish("sent");
    }
    const located = await withSessionLocation(tx, booking);
    const rules = effectiveRules(await policiesOf(tx, booking));
    const verdict = ruleVerdict(current, located, rules, now);
    if ("outcome" in verdict) return finish(verdict.outcome);
    const { rule } = verdict;
    const scheduledFor = new Date((current.anchorAt ?? now).getTime() + offsetOf(rule) * 60_000);
    await recordChange(tx, booking, {
      type: "scheduling.booking.reminder",
      webhook: "scheduling.booking.reminder",
      actor,
      occurredAt: now,
      momentAt: scheduledFor,
      reminder: {
        key: rule.key,
        anchor: rule.anchor,
        before_minutes: rule.before_minutes,
        after_minutes: rule.after_minutes,
        scheduled_for: scheduledFor.toISOString(),
      },
      details: { key: rule.key },
      message: `Reminder "${rule.key}" due`,
    });
    return finish("sent");
  });
}

/** What's been queued for a booking and what became of it. Never who it went to. */
export async function listBookingNotifications(
  env: Pick<SchedulingEnvironment, "organizationId" | "environmentId">,
  bookingId: string,
): Promise<BookingNotificationObjectOutput[]> {
  const [booking] = await db
    .select({ id: schedulingBooking.id })
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.id, bookingId),
        eq(schedulingBooking.organizationId, env.organizationId),
        eq(schedulingBooking.environmentId, env.environmentId),
      ),
    );
  if (!booking)
    throw new SchedulingError("not_found", `No booking "${bookingId}" in this environment.`);
  const rows = await db
    .select()
    .from(schedulingNotification)
    .where(
      and(
        eq(schedulingNotification.bookingId, bookingId),
        eq(schedulingNotification.organizationId, env.organizationId),
      ),
    )
    .orderBy(asc(schedulingNotification.dueAt), asc(schedulingNotification.id))
    .limit(500);
  return rows.map((row) => ({
    object: "scheduling.booking_notification",
    id: row.id,
    kind: row.kind,
    reminder_key: row.reminderKey,
    channel: row.channel,
    recipient: row.recipient,
    due_at: row.dueAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    outcome: row.outcome,
  }));
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
  const senderName = oneLine(settings?.brandName ?? "Your bookings");
  const session = deps.publicUrl
    ? await createHostInvitationSession(env, host.id, deps.publicUrl, now)
    : null;
  const zoom = row.kind === "zoom_needs_reauth";
  const message = renderMessage(branding, senderName, {
    subject: zoom ? "Your Zoom account needs reconnecting" : "Your calendar needs reconnecting",
    blocks: [
      {
        paragraph: zoom
          ? "We can't reach your Zoom account any more, so new bookings won't get a Zoom link. You're still being offered, and existing links keep working."
          : "We can't read your calendar any more, so you aren't being offered for new bookings. Existing bookings stay as they are.",
      },
      ...(session?.url
        ? [
            {
              button: {
                label: zoom ? "Reconnect Zoom" : "Reconnect your calendar",
                url: session.url,
              },
            } as EmailBlock,
          ]
        : [{ paragraph: `Please reconnect it through ${senderName}.` } as EmailBlock]),
    ],
    reason: `You're receiving this as a host with ${senderName}.`,
  });
  await deps.notifier.email({
    environment: env,
    from: settings?.emailFrom ?? null,
    senderName,
    to: host.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    cossSubject: message.cossSubject,
    cossText: message.cossText,
    cossHtml: message.cossHtml,
    replyTo: settings?.emailFrom ? (settings.emailReplyTo ?? null) : null,
    ics: null,
    logo: message.logo,
    idempotencyKey: `scheduling:${row.id}`,
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
      if (row.channel === "webhook") {
        await sendTimedWebhook(row, now);
        continue;
      }
      const booking = await withSessionLocation(db, found);
      let rule: ReminderRule | null = null;
      if (row.kind === "reminder" && row.reminderKey) {
        const rules = effectiveRules(await policiesOf(db, found));
        const verdict = ruleVerdict(row, booking, rules, now);
        if ("outcome" in verdict) {
          await finish(row, verdict.outcome, now);
          continue;
        }
        rule = verdict.rule;
        const fromCoss = row.channel === "email" && !(await settingsOf(row))?.emailFrom;
        if (fromCoss && !withinCossAllowance(rules, rule)) {
          await finish(row, "no_sender", now);
          continue;
        }
      }
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
          ? await sendBookingEmail(row, booking, deps, now, rule)
          : await sendBookingSms(row, booking, deps, now, rule);
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
