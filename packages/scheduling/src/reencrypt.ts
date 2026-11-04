/** Calendar credentials aren't here: they use WEBHOOK_SECRETS_KEY and `reencryptWebhookSecrets`. */
import { db, schema } from "@coss/db";
import type { SecretsKeyRing } from "@coss/webhooks";
import { decryptSecret, encryptSecret, isEncryptedWithPrimary } from "@coss/webhooks";
import { and, asc, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";

const { schedulingAttendee, schedulingBooking, schedulingOutOfOffice, schedulingSession } = schema;

/** A test compares this with the database's columns. */
export const SCHEDULING_DATA_KEY_COLUMNS = [
  "scheduling_attendee.encrypted_contact",
  "scheduling_attendee.encrypted_answers",
  "scheduling_booking.encrypted_attributes",
  "scheduling_out_of_office.encrypted_notes",
  "scheduling_session.encrypted_attendee",
  "scheduling_session.encrypted_attributes",
] as const;

export type SchedulingDataKeyColumn = (typeof SCHEDULING_DATA_KEY_COLUMNS)[number];

// A wrong key makes every row unreadable, and the list mustn't fill the memory.
const MAX_LISTED_UNREADABLE = 1000;

export type UnreadableRow = {
  id: string;
  organizationId: string;
  column: SchedulingDataKeyColumn;
  error: string;
};

export type SchedulingReencryptResult = {
  checked: number;
  /** With `dryRun`: that would be. */
  reencrypted: number;
  unreadableCount: number;
  /** The first of them. */
  unreadable: UnreadableRow[];
  /** Rows that changed or went while this ran: run again. */
  conflicts: number;
};

// A wrong key's own error comes from the cipher and says nothing useful.
function unreadableReason(stored: string, keys: SecretsKeyRing): string {
  const [version, keyId] = stored.split(":");
  if (version === "v2" && keyId && !keys.keys.some((key) => key.id === keyId)) {
    return `Encrypted with key ${keyId}, which is not in SCHEDULING_DATA_KEYS.`;
  }
  return "No key in SCHEDULING_DATA_KEYS decrypts this value, or it's corrupt.";
}

type Options = {
  keys: SecretsKeyRing;
  dryRun?: boolean | undefined;
  batchSize?: number | undefined;
  scope?: { organizationIds: readonly string[] } | undefined;
  /** Tests: changes a row between its read and its write. */
  beforeWrite?: ((id: string) => Promise<void>) | undefined;
};

/** Null when the row is already on the primary key, or a column can't be read. */
function rewritten<C extends SchedulingDataKeyColumn>(
  row: { id: string; organizationId: string },
  columns: readonly (readonly [C, string | null])[],
  opts: Options,
  result: SchedulingReencryptResult,
): Map<C, string | null> | null {
  let stale = false;
  let unreadable = false;
  const next = new Map<C, string | null>();
  for (const [column, stored] of columns) {
    if (stored === null || isEncryptedWithPrimary(stored, opts.keys)) {
      next.set(column, stored);
      continue;
    }
    stale = true;
    try {
      next.set(column, encryptSecret(decryptSecret(stored, opts.keys), opts.keys));
    } catch {
      unreadable = true;
      result.unreadableCount++;
      if (result.unreadable.length < MAX_LISTED_UNREADABLE) {
        result.unreadable.push({
          id: row.id,
          organizationId: row.organizationId,
          column,
          error: unreadableReason(stored, opts.keys),
        });
      }
    }
  }
  return stale && !unreadable ? next : null;
}

async function reencryptAttendees(opts: Options, result: SchedulingReencryptResult): Promise<void> {
  const batchSize = opts.batchSize ?? 200;
  let after = "";
  for (;;) {
    const rows = await db
      .select({
        id: schedulingAttendee.id,
        organizationId: schedulingAttendee.organizationId,
        contact: schedulingAttendee.encryptedContact,
        answers: schedulingAttendee.encryptedAnswers,
      })
      .from(schedulingAttendee)
      .where(
        and(
          gt(schedulingAttendee.id, after),
          or(
            isNotNull(schedulingAttendee.encryptedContact),
            isNotNull(schedulingAttendee.encryptedAnswers),
          ),
          opts.scope
            ? inArray(schedulingAttendee.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .orderBy(asc(schedulingAttendee.id))
      .limit(batchSize);
    for (const row of rows) {
      result.checked++;
      const next = rewritten(
        row,
        [
          ["scheduling_attendee.encrypted_contact", row.contact],
          ["scheduling_attendee.encrypted_answers", row.answers],
        ],
        opts,
        result,
      );
      if (!next) continue;
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      await opts.beforeWrite?.(row.id);
      // The compare-and-set is what keeps an attendee erased meanwhile erased.
      const [updated] = await db
        .update(schedulingAttendee)
        .set({
          encryptedContact: next.get("scheduling_attendee.encrypted_contact") ?? null,
          encryptedAnswers: next.get("scheduling_attendee.encrypted_answers") ?? null,
        })
        .where(
          and(
            eq(schedulingAttendee.id, row.id),
            eq(schedulingAttendee.organizationId, row.organizationId),
            row.contact === null
              ? isNull(schedulingAttendee.encryptedContact)
              : eq(schedulingAttendee.encryptedContact, row.contact),
            row.answers === null
              ? isNull(schedulingAttendee.encryptedAnswers)
              : eq(schedulingAttendee.encryptedAnswers, row.answers),
          ),
        )
        .returning({ id: schedulingAttendee.id });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < batchSize) break;
    after = last.id;
  }
}

async function reencryptBookings(opts: Options, result: SchedulingReencryptResult): Promise<void> {
  const batchSize = opts.batchSize ?? 200;
  let after = "";
  for (;;) {
    const rows = await db
      .select({
        id: schedulingBooking.id,
        organizationId: schedulingBooking.organizationId,
        attributes: schedulingBooking.encryptedAttributes,
      })
      .from(schedulingBooking)
      .where(
        and(
          gt(schedulingBooking.id, after),
          isNotNull(schedulingBooking.encryptedAttributes),
          opts.scope
            ? inArray(schedulingBooking.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .orderBy(asc(schedulingBooking.id))
      .limit(batchSize);
    for (const row of rows) {
      result.checked++;
      const next = rewritten(
        row,
        [["scheduling_booking.encrypted_attributes", row.attributes]],
        opts,
        result,
      );
      if (!next) continue;
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      await opts.beforeWrite?.(row.id);
      // The compare-and-set is what keeps a booking erased meanwhile erased.
      const [updated] = await db
        .update(schedulingBooking)
        .set({ encryptedAttributes: next.get("scheduling_booking.encrypted_attributes") ?? null })
        .where(
          and(
            eq(schedulingBooking.id, row.id),
            eq(schedulingBooking.organizationId, row.organizationId),
            eq(schedulingBooking.encryptedAttributes, row.attributes as string),
          ),
        )
        .returning({ id: schedulingBooking.id });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < batchSize) break;
    after = last.id;
  }
}

async function reencryptOutOfOffice(
  opts: Options,
  result: SchedulingReencryptResult,
): Promise<void> {
  const batchSize = opts.batchSize ?? 200;
  let after = "";
  for (;;) {
    const rows = await db
      .select({
        id: schedulingOutOfOffice.id,
        organizationId: schedulingOutOfOffice.organizationId,
        notes: schedulingOutOfOffice.encryptedNotes,
      })
      .from(schedulingOutOfOffice)
      .where(
        and(
          gt(schedulingOutOfOffice.id, after),
          isNotNull(schedulingOutOfOffice.encryptedNotes),
          opts.scope
            ? inArray(schedulingOutOfOffice.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .orderBy(asc(schedulingOutOfOffice.id))
      .limit(batchSize);
    for (const row of rows) {
      result.checked++;
      const next = rewritten(
        row,
        [["scheduling_out_of_office.encrypted_notes", row.notes]],
        opts,
        result,
      );
      if (!next) continue;
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      await opts.beforeWrite?.(row.id);
      const [updated] = await db
        .update(schedulingOutOfOffice)
        .set({ encryptedNotes: next.get("scheduling_out_of_office.encrypted_notes") ?? null })
        .where(
          and(
            eq(schedulingOutOfOffice.id, row.id),
            eq(schedulingOutOfOffice.organizationId, row.organizationId),
            eq(schedulingOutOfOffice.encryptedNotes, row.notes as string),
          ),
        )
        .returning({ id: schedulingOutOfOffice.id });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < batchSize) break;
    after = last.id;
  }
}

// Expired sessions count too: they still hold someone's details.
async function reencryptSessions(opts: Options, result: SchedulingReencryptResult): Promise<void> {
  const batchSize = opts.batchSize ?? 200;
  let after = "";
  for (;;) {
    const rows = await db
      .select({
        id: schedulingSession.id,
        organizationId: schedulingSession.organizationId,
        attendee: schedulingSession.encryptedAttendee,
        attributes: schedulingSession.encryptedAttributes,
      })
      .from(schedulingSession)
      .where(
        and(
          gt(schedulingSession.id, after),
          or(
            isNotNull(schedulingSession.encryptedAttendee),
            isNotNull(schedulingSession.encryptedAttributes),
          ),
          opts.scope
            ? inArray(schedulingSession.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .orderBy(asc(schedulingSession.id))
      .limit(batchSize);
    for (const row of rows) {
      result.checked++;
      const next = rewritten(
        row,
        [
          ["scheduling_session.encrypted_attendee", row.attendee],
          ["scheduling_session.encrypted_attributes", row.attributes],
        ],
        opts,
        result,
      );
      if (!next) continue;
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      await opts.beforeWrite?.(row.id);
      const [updated] = await db
        .update(schedulingSession)
        .set({
          encryptedAttendee: next.get("scheduling_session.encrypted_attendee") ?? null,
          encryptedAttributes: next.get("scheduling_session.encrypted_attributes") ?? null,
        })
        .where(
          and(
            eq(schedulingSession.id, row.id),
            eq(schedulingSession.organizationId, row.organizationId),
            row.attendee === null
              ? isNull(schedulingSession.encryptedAttendee)
              : eq(schedulingSession.encryptedAttendee, row.attendee),
            row.attributes === null
              ? isNull(schedulingSession.encryptedAttributes)
              : eq(schedulingSession.encryptedAttributes, row.attributes),
          ),
        )
        .returning({ id: schedulingSession.id });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < batchSize) break;
    after = last.id;
  }
}

/** Idempotent and safe while the apps serve traffic: it resumes by running again. */
export async function reencryptSchedulingData(opts: Options): Promise<SchedulingReencryptResult> {
  const result: SchedulingReencryptResult = {
    checked: 0,
    reencrypted: 0,
    unreadableCount: 0,
    unreadable: [],
    conflicts: 0,
  };
  await reencryptAttendees(opts, result);
  await reencryptBookings(opts, result);
  await reencryptOutOfOffice(opts, result);
  await reencryptSessions(opts, result);
  return result;
}
