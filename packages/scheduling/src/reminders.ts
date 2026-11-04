/**
 * A `reminders` list says what goes out around a booking: when, to whom, and optionally in whose
 * words. Rows in `scheduling_notification` are what's owed; each one names its rule, and a rule is
 * read again when its row is due, so editing or deleting one takes effect without touching rows.
 * Only a rule that's new needs rows made for bookings that already exist (`runDueReminderSyncs`).
 *
 * A dedupe key names the rule, the timing and the moment, never the booking's version: re-running
 * the planning changes nothing, a reminder that went out can't go out again, and a booking moved
 * away and back gets its reminder back.
 */
import { db, type Executor, schema } from "@coss/db";
import { and, asc, eq, gt, gte, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { SchedulingError } from "./errors.ts";
import { type Policies, policiesOf, resolvePolicy } from "./notification-policy.ts";
import {
  MAX_REMINDER_EMAILS_FROM_COSS,
  type ReminderInputOutput,
  reminderKeyOf,
  reminderUrlHost,
} from "./schemas.ts";
import { refuseLinks, type SetupScreening, screenSetup } from "./screening.ts";
import type { SchedulingEnvironment } from "./types.ts";

const { member, schedulingBooking, schedulingNotification, schedulingReminderSync, user } = schema;

export type ReminderRule = NonNullable<
  typeof schema.schedulingSettings.$inferSelect.reminders
>[number];
type BookingRow = typeof schedulingBooking.$inferSelect;
type NotificationInsert = typeof schedulingNotification.$inferInsert;
type NotificationRow = typeof schedulingNotification.$inferSelect;

const MINUTE_MS = 60_000;
/** An email or text this late is worse than none. Webhooks are facts, so they're always sent. */
const LATE_LIMIT_MS = 24 * 60 * MINUTE_MS;

export const DEFAULT_REMINDER_KEY = "reminder";

export type ReminderChecks = {
  screen?: SetupScreening | undefined;
  /** Whether an address is on a domain the organization verified: `authorizeLiveSender`, injected. */
  verifiedAddress?:
    | ((input: { organizationId: string; address: string }) => Promise<boolean>)
    | undefined;
};

export function normalizeReminders(list: readonly ReminderInputOutput[]): ReminderRule[] {
  return list.map((rule) => {
    const onlyIf = rule.only_if ?? null;
    return {
      key: reminderKeyOf(rule),
      anchor: rule.anchor,
      before_minutes: rule.before_minutes ?? null,
      after_minutes: rule.after_minutes ?? (rule.before_minutes == null ? 0 : null),
      send: rule.send ?? [],
      email_to: (rule.email_to ?? []).map((address) => address.toLowerCase()),
      subject: rule.subject ?? null,
      message: rule.message ?? null,
      sms_message: rule.sms_message ?? null,
      button: rule.button ?? null,
      include_invite: rule.include_invite ?? false,
      send_if_late: rule.send_if_late ?? false,
      skip_no_show: rule.skip_no_show ?? rule.anchor === "end",
      only_if: onlyIf
        ? { metadata: onlyIf.metadata ?? null, location_types: onlyIf.location_types ?? null }
        : null,
    };
  });
}

/** An event type's list, else the environment's, else today's one reminder a day before. */
export function effectiveRules(policies: Policies): ReminderRule[] {
  const own = policies.eventTypeReminders ?? policies.environmentReminders;
  if (own) return own;
  const policy = resolvePolicy("reminder", policies.environment, policies.eventType);
  const send: ReminderRule["send"] = [
    ...(policy.emailAttendee ? (["email_attendee"] as const) : []),
    ...(policy.emailHost ? (["email_host"] as const) : []),
    ...(policy.smsAttendee ? (["sms_attendee"] as const) : []),
  ];
  if (send.length === 0) return [];
  return [
    {
      key: DEFAULT_REMINDER_KEY,
      anchor: "start",
      before_minutes: 1440,
      after_minutes: null,
      send,
      email_to: [],
      subject: null,
      message: null,
      sms_message: null,
      button: null,
      include_invite: false,
      send_if_late: false,
      skip_no_show: false,
      only_if: null,
    },
  ];
}

const emailsAnyone = (rule: ReminderRule) =>
  rule.email_to.length > 0 || rule.send.some((item) => item.startsWith("email_"));

export const hasCustomEmail = (rule: ReminderRule) =>
  Boolean(rule.subject || rule.message || rule.button);

/** What a page shows: the list that applies, and where it comes from. */
export async function effectiveRemindersOf(
  scope: { organizationId: string; environmentId: string },
  eventTypeId: string | null,
): Promise<{ rules: ReminderRule[]; source: "event_type" | "environment" | "default" }> {
  const policies = await policiesOf(db, { ...scope, eventTypeId: eventTypeId ?? "" });
  return {
    rules: effectiveRules(policies),
    source: policies.eventTypeReminders
      ? "event_type"
      : policies.environmentReminders
        ? "environment"
        : "default",
  };
}

/** Fallback emails are sent and paid for by coss.com, so there are only so many of them. */
export function withinCossAllowance(rules: readonly ReminderRule[], rule: ReminderRule): boolean {
  const index = rules.filter(emailsAnyone).findIndex((other) => other.key === rule.key);
  return index >= 0 && index < MAX_REMINDER_EMAILS_FROM_COSS;
}

export const offsetOf = (rule: ReminderRule) => rule.after_minutes ?? -(rule.before_minutes ?? 0);

type Target = { channel: "email" | "sms" | "webhook"; recipient: NotificationRow["recipient"] };

function targetsOf(rule: ReminderRule): Target[] {
  const targets: Target[] = rule.send.map((item) => {
    if (item === "webhook") return { channel: "webhook", recipient: "endpoint" };
    const [channel, recipient] = item.split("_") as ["email" | "sms", "attendee" | "host"];
    return { channel, recipient };
  });
  if (rule.email_to.length > 0) targets.push({ channel: "email", recipient: "address" });
  return targets;
}

/** The moment of a rule's anchor, for a row queued now. */
function anchorMoment(rule: ReminderRule, booking: BookingRow, now: Date): Date | null {
  if (rule.anchor === "start") return booking.startAt;
  if (rule.anchor === "end") return booking.endAt;
  if (rule.anchor === "no_show") return booking.noShowAt;
  return now;
}

function rowsOfRule(rule: ReminderRule, booking: BookingRow, now: Date): NotificationInsert[] {
  const anchorAt = anchorMoment(rule, booking, now);
  if (!anchorAt) return [];
  const offset = offsetOf(rule);
  const scheduled = anchorAt.getTime() + offset * MINUTE_MS;
  const timed = rule.anchor === "start" || rule.anchor === "end";
  const passed = timed && scheduled <= now.getTime();
  const catchesUp = passed && rule.send_if_late && booking.startAt.getTime() > now.getTime();
  // A moment that's passed is recorded, so a booking can say why it had no reminder.
  const finished = passed && !catchesUp;
  return targetsOf(rule).map((target) => ({
    organizationId: booking.organizationId,
    environmentId: booking.environmentId,
    bookingId: booking.id,
    kind: "reminder",
    channel: target.channel,
    recipient: target.recipient,
    bookingVersion: booking.version,
    reminderKey: rule.key,
    reminderAnchor: rule.anchor,
    reminderOffsetMinutes: offset,
    anchorAt,
    dedupeKey: `reminder:${rule.key}:${rule.anchor}:${offset}:${target.channel}:${target.recipient}:${booking.id}:${anchorAt.getTime()}`,
    dueAt: catchesUp ? now : new Date(scheduled),
    ...(finished ? { finishedAt: now, outcome: "too_late" } : {}),
  }));
}

/** Every confirmed booking gets these, so an endpoint added later still hears about it. */
function momentRows(booking: BookingRow): NotificationInsert[] {
  return (
    [
      ["started", booking.startAt],
      ["ended", booking.endAt],
    ] as const
  ).map(([kind, at]) => ({
    organizationId: booking.organizationId,
    environmentId: booking.environmentId,
    bookingId: booking.id,
    kind,
    channel: "webhook" as const,
    recipient: "endpoint" as const,
    bookingVersion: booking.version,
    anchorAt: at,
    dedupeKey: `${kind}:webhook:endpoint:${booking.id}:${at.getTime()}`,
    dueAt: at,
  }));
}

/**
 * Inserts what's owed. What was dropped comes back, since the booking moved back or the rule returned;
 * what was sent or failed stays as it is.
 */
export async function insertReminderRows(
  tx: Executor,
  rows: readonly NotificationInsert[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx
    .insert(schedulingNotification)
    .values([...rows])
    .onConflictDoUpdate({
      target: [schedulingNotification.environmentId, schedulingNotification.dedupeKey],
      set: {
        bookingVersion: sql`excluded.booking_version`,
        dueAt: sql`excluded.due_at`,
        finishedAt: sql`excluded.finished_at`,
        outcome: sql`excluded.outcome`,
        leaseUntil: null,
        attempts: 0,
      },
      where: sql`${schedulingNotification.outcome} IN ('superseded', 'stale')`,
    });
}

/** Rows timed from something that just happened, such as a cancellation. */
export async function queueRulesOfAnchor(
  tx: Executor,
  booking: BookingRow,
  rules: readonly ReminderRule[],
  anchor: ReminderRule["anchor"],
  now: Date,
): Promise<void> {
  await insertReminderRows(
    tx,
    rules
      .filter((rule) => rule.anchor === anchor)
      .flatMap((rule) => rowsOfRule(rule, booking, now)),
  );
}

const isTimedRow = () =>
  or(
    inArray(schedulingNotification.kind, ["started", "ended"]),
    and(
      eq(schedulingNotification.kind, "reminder"),
      or(
        inArray(schedulingNotification.reminderAnchor, ["start", "end"]),
        isNull(schedulingNotification.reminderAnchor),
      ),
    ),
  );

/**
 * Makes a confirmed booking's timed rows what its rules and times now ask for. `newBooking`: the
 * booking itself just changed, so a passed moment is recorded and `send_if_late` catches up. A list
 * that changed adds only moments still ahead: saving a list never sends anything right away, to
 * every upcoming booking at once. Either way a row its rule still wants stays, due or not.
 */
export async function reconcileReminders(
  tx: Executor,
  booking: BookingRow,
  rules: readonly ReminderRule[],
  now: Date,
  opts: { newBooking: boolean },
): Promise<void> {
  const desired = [
    ...rules
      .filter((rule) => rule.anchor === "start" || rule.anchor === "end")
      .flatMap((rule) => rowsOfRule(rule, booking, now)),
    ...momentRows(booking),
  ];
  await tx
    .update(schedulingNotification)
    .set({ finishedAt: now, outcome: "superseded", leaseUntil: null })
    .where(
      and(
        eq(schedulingNotification.bookingId, booking.id),
        eq(schedulingNotification.organizationId, booking.organizationId),
        isNull(schedulingNotification.finishedAt),
        isTimedRow(),
        notInArray(
          schedulingNotification.dedupeKey,
          desired.map((row) => row.dedupeKey),
        ),
      ),
    );
  await insertReminderRows(
    tx,
    opts.newBooking
      ? desired
      : desired.filter((row) => row.kind !== "reminder" || row.dueAt.getTime() > now.getTime()),
  );
}

/** The booking's over before its time: nothing timed from it will happen. */
export async function supersedeOnEnd(tx: Executor, booking: BookingRow, now: Date): Promise<void> {
  await tx
    .update(schedulingNotification)
    .set({ finishedAt: now, outcome: "superseded", leaseUntil: null })
    .where(
      and(
        eq(schedulingNotification.bookingId, booking.id),
        eq(schedulingNotification.organizationId, booking.organizationId),
        isNull(schedulingNotification.finishedAt),
        inArray(schedulingNotification.kind, ["reminder", "started", "ended"]),
        or(
          isNull(schedulingNotification.reminderAnchor),
          notInArray(schedulingNotification.reminderAnchor, ["cancelled", "declined"]),
        ),
      ),
    );
}

/**
 * Whether a row is still owed by this booking as it stands. A location or a no-show doesn't move what
 * a reminder is timed from, so those leave it alone without anyone having to carry it forward.
 */
export function isRuleRowStale(
  row: Pick<NotificationRow, "kind" | "reminderAnchor" | "anchorAt" | "bookingVersion">,
  booking: BookingRow,
): boolean {
  const moved = (moment: Date) => row.anchorAt?.getTime() !== moment.getTime();
  if (row.kind === "started") return booking.status !== "confirmed" || moved(booking.startAt);
  if (row.kind === "ended") return booking.status !== "confirmed" || moved(booking.endAt);
  // Queued by a task from before anchors, mid-deploy.
  if (row.anchorAt === null) {
    return booking.status !== "confirmed" || row.bookingVersion !== booking.version;
  }
  const ended = booking.status === "cancelled" || booking.status === "declined";
  switch (row.reminderAnchor) {
    case "start":
      return booking.status !== "confirmed" || moved(booking.startAt);
    case "end":
      return booking.status !== "confirmed" || moved(booking.endAt);
    case "confirmed":
      return booking.status !== "confirmed";
    case "rescheduled":
      return ended;
    case "pending_approval":
      return booking.status !== "pending_approval";
    case "cancelled":
      return booking.status !== "cancelled";
    case "declined":
      return booking.status !== "declined";
    case "no_show":
      return booking.status !== "confirmed" || booking.noShowAt === null;
    default:
      return true;
  }
}

/** What a booking's location was chosen as: a Meet link is still `google_meet` once it exists. */
function locationKind(location: BookingRow["location"]): string {
  if (!location) return "";
  return (location as { conference?: string }).conference ?? location.type;
}

/** What a due row's rule says now, or the outcome that finishes the row instead of sending it. */
export function ruleVerdict(
  row: NotificationRow,
  booking: Pick<BookingRow, "metadata" | "noShowAt" | "location" | "startAt" | "endAt">,
  rules: readonly ReminderRule[],
  now: Date,
):
  | { rule: ReminderRule }
  | { outcome: "stale" | "filtered" | "no_show" | "too_late" }
  | { moveTo: Date; offsetMinutes: number } {
  const rule = rules.find(
    (candidate) => candidate.key === row.reminderKey && candidate.anchor === row.reminderAnchor,
  );
  if (!rule) return { outcome: "stale" };
  if (offsetOf(rule) !== row.reminderOffsetMinutes) {
    // A changed list's walk makes a row for the new moment, on a start or end of a booking that
    // hasn't ended. Nothing walks anything else, so that row takes the new timing itself, or the
    // edit would lose it. An edit to sooner can only be seen once the row comes due: it goes then.
    const walked =
      (rule.anchor === "start" || rule.anchor === "end") && booking.endAt.getTime() > now.getTime();
    if (walked) return { outcome: "stale" };
    const due = (row.anchorAt?.getTime() ?? now.getTime()) + offsetOf(rule) * MINUTE_MS;
    if (due > now.getTime()) return { moveTo: new Date(due), offsetMinutes: offsetOf(rule) };
  }
  const targeted = targetsOf(rule).some(
    (target) => target.channel === row.channel && target.recipient === row.recipient,
  );
  if (!targeted) return { outcome: "stale" };
  const onlyIf = rule.only_if;
  if (onlyIf?.metadata) {
    for (const [key, value] of Object.entries(onlyIf.metadata)) {
      if (booking.metadata[key] !== value) return { outcome: "filtered" };
    }
  }
  if (onlyIf?.location_types && !onlyIf.location_types.includes(locationKind(booking.location))) {
    return { outcome: "filtered" };
  }
  if (rule.skip_no_show && booking.noShowAt) return { outcome: "no_show" };
  if (row.channel !== "webhook") {
    // Zero minutes before is the start itself, due the moment it stops being before.
    const beforeStart = rule.anchor === "start" && Boolean(rule.before_minutes);
    if (beforeStart && now.getTime() >= booking.startAt.getTime()) return { outcome: "too_late" };
    // From when it was due: `send_if_late` queues a reminder long after its moment, retries only
    // move this later, and by minutes.
    if (now.getTime() - row.dueAt.getTime() > LATE_LIMIT_MS) return { outcome: "too_late" };
  }
  return { rule };
}

async function memberAddresses(organizationId: string, addresses: string[]): Promise<Set<string>> {
  if (addresses.length === 0) return new Set();
  const rows = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        inArray(sql`lower(${user.email})`, addresses),
        eq(user.emailVerified, true),
      ),
    );
  return new Set(rows.map((row) => row.email.toLowerCase()));
}

/**
 * What a list may do, checked when it's saved. Reminder text goes out unscreened to patients, so it's
 * screened here. Words of the customer's own go out only under the customer's own address.
 */
/** Taking `email_from` away is refused while a list needs it: reminders would change or stop. */
export function checkRemindersWithoutSender(rules: readonly ReminderRule[], param: string): void {
  const refuse = (message: string) => new SchedulingError("invalid_reminder", message, { param });
  if (rules.filter(emailsAnyone).length > MAX_REMINDER_EMAILS_FROM_COSS) {
    throw refuse(
      `Without email_from, at most ${MAX_REMINDER_EMAILS_FROM_COSS} reminders can send email.`,
    );
  }
  if (rules.some(hasCustomEmail)) {
    throw refuse("Your own words and buttons only go out from your own address: set email_from.");
  }
}

export async function checkReminders(
  env: Pick<SchedulingEnvironment, "organizationId" | "mode">,
  rules: readonly ReminderRule[],
  emailFrom: string | null | undefined,
  checks: ReminderChecks,
): Promise<void> {
  const refuse = (message: string, param: string) =>
    new SchedulingError("invalid_reminder", message, { param });
  if (!emailFrom && rules.filter(emailsAnyone).length > MAX_REMINDER_EMAILS_FROM_COSS) {
    throw refuse(
      `Without email_from, at most ${MAX_REMINDER_EMAILS_FROM_COSS} reminders can send email.`,
      "reminders",
    );
  }
  for (const [index, rule] of rules.entries()) {
    const at = (field: string) => `reminders[${index}].${field}`;
    if (!emailFrom && hasCustomEmail(rule)) {
      throw refuse(
        "Your own words and buttons only go out from your own address: set email_from.",
        at(rule.subject ? "subject" : rule.message ? "message" : "button"),
      );
    }
    refuseLinks(rule.subject, at("subject"));
    refuseLinks(rule.message, at("message"));
    refuseLinks(rule.sms_message, at("sms_message"));
    refuseLinks(rule.button?.label, at("button"));
    // One at a time: a rule fits within what the classifier reads, and a whole list doesn't, so
    // what's past its limit would go out unscreened.
    const text = [rule.subject, rule.message, rule.sms_message, rule.button?.label]
      .filter(Boolean)
      .join("\n");
    await screenSetup(env, text, checks.screen, at("message"));
  }
  if (env.mode !== "live") return;
  const verified = async (address: string) =>
    (await checks.verifiedAddress?.({ organizationId: env.organizationId, address })) === true;
  for (const [index, rule] of rules.entries()) {
    const members = await memberAddresses(env.organizationId, rule.email_to);
    for (const [position, address] of rule.email_to.entries()) {
      if (members.has(address) || (await verified(address))) continue;
      throw refuse(
        `${address} is neither a member of your organization nor on one of its verified domains.`,
        `reminders[${index}].email_to[${position}]`,
      );
    }
    if (rule.button) {
      const host = reminderUrlHost(rule.button.url);
      // `postmaster@` only asks the sending rules about the host: nothing's sent there.
      if (!host || !(await verified(`postmaster@${host}`))) {
        throw refuse(
          `${host ?? rule.button.url} isn't on one of your verified domains.`,
          `reminders[${index}].button`,
        );
      }
    }
  }
}

/** Upcoming bookings need rows for this new list. Another change restarts the walk. */
export async function queueReminderSync(
  tx: Executor,
  scope: { organizationId: string; environmentId: string },
  eventTypeId: string | null,
): Promise<void> {
  await tx
    .delete(schedulingReminderSync)
    .where(
      and(
        eq(schedulingReminderSync.organizationId, scope.organizationId),
        eq(schedulingReminderSync.environmentId, scope.environmentId),
        eventTypeId
          ? eq(schedulingReminderSync.eventTypeId, eventTypeId)
          : isNull(schedulingReminderSync.eventTypeId),
      ),
    );
  await tx.insert(schedulingReminderSync).values({ ...scope, eventTypeId });
}

const SYNC_LEASE_MS = 2 * 60_000;
const SYNC_PAGE = 200;
/** Bookings last a day at most: one that started earlier than this has ended. */
const LONGEST_BOOKING_MS = 24 * 60 * MINUTE_MS;

async function claimSyncs(
  now: Date,
  opts: { limit?: number; scope?: { organizationIds: readonly string[] } },
) {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(schedulingReminderSync)
      .where(
        and(
          or(isNull(schedulingReminderSync.leaseUntil), lt(schedulingReminderSync.leaseUntil, now)),
          opts.scope
            ? inArray(schedulingReminderSync.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .orderBy(asc(schedulingReminderSync.createdAt))
      .limit(opts.limit ?? 5)
      .for("update", { skipLocked: true });
    if (due.length > 0) {
      await tx
        .update(schedulingReminderSync)
        .set({ leaseUntil: new Date(now.getTime() + SYNC_LEASE_MS) })
        .where(
          inArray(
            schedulingReminderSync.id,
            due.map((row) => row.id),
          ),
        );
    }
    return due;
  });
}

/**
 * Worker: walks the upcoming bookings of a changed list a page at a time. Only ones that haven't
 * ended: a follow-up added today isn't sent about last week's meeting.
 */
export async function runDueReminderSyncs(
  deps: { now?: () => Date },
  opts: { limit?: number; scope?: { organizationIds: readonly string[] } } = {},
): Promise<number> {
  const now = deps.now?.() ?? new Date();
  let walked = 0;
  for (const sync of await claimSyncs(now, opts)) {
    const cursor =
      sync.cursorStartAt && sync.cursorBookingId
        ? or(
            gt(schedulingBooking.startAt, sync.cursorStartAt),
            and(
              eq(schedulingBooking.startAt, sync.cursorStartAt),
              gt(schedulingBooking.id, sync.cursorBookingId),
            ),
          )
        : undefined;
    const page = await db
      .select({
        id: schedulingBooking.id,
        startAt: schedulingBooking.startAt,
        eventTypeId: schedulingBooking.eventTypeId,
      })
      .from(schedulingBooking)
      .where(
        and(
          eq(schedulingBooking.organizationId, sync.organizationId),
          eq(schedulingBooking.environmentId, sync.environmentId),
          gte(schedulingBooking.startAt, new Date(now.getTime() - LONGEST_BOOKING_MS)),
          gt(schedulingBooking.endAt, now),
          eq(schedulingBooking.status, "confirmed"),
          sync.eventTypeId ? eq(schedulingBooking.eventTypeId, sync.eventTypeId) : undefined,
          cursor,
        ),
      )
      .orderBy(asc(schedulingBooking.startAt), asc(schedulingBooking.id))
      .limit(SYNC_PAGE);
    for (const { id } of page) {
      await db.transaction(async (tx) => {
        const [booking] = await tx
          .select()
          .from(schedulingBooking)
          .where(
            and(
              eq(schedulingBooking.id, id),
              eq(schedulingBooking.organizationId, sync.organizationId),
            ),
          )
          .for("update");
        if (booking?.status !== "confirmed") return;
        const rules = effectiveRules(await policiesOf(tx, booking));
        await reconcileReminders(tx, booking, rules, now, { newBooking: false });
      });
    }
    walked += page.length;
    const last = page.at(-1);
    if (page.length < SYNC_PAGE || !last) {
      await db.delete(schedulingReminderSync).where(eq(schedulingReminderSync.id, sync.id));
    } else {
      // Gone if the list changed again meanwhile: the new walk starts over.
      await db
        .update(schedulingReminderSync)
        .set({ cursorStartAt: last.startAt, cursorBookingId: last.id, leaseUntil: null })
        .where(eq(schedulingReminderSync.id, sync.id));
    }
  }
  return walked;
}
