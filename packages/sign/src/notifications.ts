/**
 * Email delivery and expiry, run by the worker's `sign-notifications` loop: sent requests past
 * `expires_at` expire; email signers whose turn it is get their invitation, then reminders (every
 * `reminder_interval_days`, up to `MAX_SIGN_REMINDERS`, or when asked for); once the signed
 * document is sealed they get their copy. Every email carries a fresh signing link and a stable
 * idempotency key, and its signer row moves by compare-and-set, so a rerun after a crash never
 * sends twice. System-level: scans every organization (`scope` narrows it in tests).
 */
import { db, schema, type Transaction } from "@coss/db";
import { and, asc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { readSignedDocument } from "./complete.ts";
import {
  invitationEmail,
  oneLine,
  reminderEmail,
  type SignMailer,
  signedCopyEmail,
} from "./emails.ts";
import { SignError } from "./errors.ts";
import type { SignActor } from "./events.ts";
import { recordSignEvent } from "./record.ts";
import { MAX_SIGN_REMINDERS } from "./schemas.ts";
import { mintSignSession } from "./sessions.ts";
import { getSignSettings, requesterName } from "./settings.ts";
import type { DocumentStore } from "./store.ts";

const { environment, signRequest, signSession, signSigner } = schema;

type RequestRow = typeof signRequest.$inferSelect;
type SignerRow = typeof signSigner.$inferSelect;

export type SignNotificationDeps = {
  mailer: SignMailer;
  /** Where signing links point (`SIGN_PUBLIC_URL`). */
  signUrl: string;
  /** Reads signed documents for the copies. */
  store: DocumentStore;
};

const DAY_MS = 86_400_000;
/** How long an emailed link works (reminders send fresh ones). */
const EMAIL_LINK_DAYS = 30;
/** Copies attach the PDF up to this size; bigger ones are a link only. */
const MAX_ATTACHED_COPY_BYTES = 10 * 1024 * 1024;
/** Asked-for reminders wait this long after the last email to a signer. */
export const REMINDER_COOLDOWN_MS = 60 * 60_000;

const SYSTEM: SignActor = { kind: "system" };

type Scope = { organizationIds: string[] } | undefined;

function scoped(scope: Scope) {
  return scope ? inArray(signRequest.organizationId, scope.organizationIds) : undefined;
}

/** Sequential order: nobody before this signer is still to sign. */
const signersTurn = sql`(${signRequest.signingOrder} = 'parallel' or not exists (
  select 1 from ${signSigner} as earlier
  where earlier.request_id = ${signSigner.requestId}
    and earlier.organization_id = ${signSigner.organizationId}
    and earlier.position < ${signSigner.position}
    and earlier.status <> 'signed'))`;

/** Expires sent requests past `expires_at`. */
async function expireDue(now: Date, limit: number, scope: Scope): Promise<number> {
  const due = await db
    .select({ id: signRequest.id, organizationId: signRequest.organizationId })
    .from(signRequest)
    .where(
      and(
        eq(signRequest.status, "sent"),
        isNotNull(signRequest.expiresAt),
        lte(signRequest.expiresAt, now),
        scoped(scope),
      ),
    )
    .orderBy(asc(signRequest.expiresAt))
    .limit(limit);
  for (const row of due) {
    await db.transaction(async (tx) => {
      const [expired] = await tx
        .update(signRequest)
        .set({ status: "expired", expiredAt: now })
        .where(
          and(
            eq(signRequest.id, row.id),
            eq(signRequest.organizationId, row.organizationId),
            eq(signRequest.status, "sent"),
          ),
        )
        .returning();
      if (!expired) return;
      const [env] = await tx
        .select({ mode: environment.mode })
        .from(environment)
        .where(eq(environment.id, expired.environmentId));
      await recordSignEvent(
        tx,
        { request: expired, sandbox: env?.mode === "sandbox" },
        { type: "expired", actor: SYSTEM, occurredAt: now },
      );
    });
  }
  return due.length;
}

type Due = { request: RequestRow; signer: SignerRow; sandbox: boolean };

async function dueSigners(
  condition: ReturnType<typeof and>,
  limit: number,
  now: Date,
): Promise<Due[]> {
  const rows = await db
    .select({ request: signRequest, signer: signSigner, mode: environment.mode })
    .from(signSigner)
    .innerJoin(
      signRequest,
      and(
        eq(signRequest.id, signSigner.requestId),
        eq(signRequest.organizationId, signSigner.organizationId),
      ),
    )
    .innerJoin(
      environment,
      and(
        eq(environment.id, signRequest.environmentId),
        eq(environment.organizationId, signRequest.organizationId),
      ),
    )
    .where(
      and(
        eq(signSigner.delivery, "email"),
        or(isNull(signSigner.emailRetryAt), lte(signSigner.emailRetryAt, now)),
        // Held while the organization is suspended: coss.com's own sender must never carry a
        // suspended organization's mail.
        sql`not exists (select 1 from ${schema.organizationSuspension} where ${schema.organizationSuspension.organizationId} = ${signRequest.organizationId})`,
        // Nor while its reputation has it suspended (sends are refused in its own environment,
        // and coss.com's sender must not carry them instead).
        sql`not exists (select 1 from ${schema.reputationStanding} where ${schema.reputationStanding.organizationId} = ${signRequest.organizationId} and ${schema.reputationStanding.status} = 'suspended')`,
        // Nor while it is being deleted: its links already don't open.
        sql`not exists (select 1 from ${schema.organizationDeletion} where ${schema.organizationDeletion.organizationId} = ${signRequest.organizationId} and ${schema.organizationDeletion.status} = 'pending')`,
        condition,
      ),
    )
    .orderBy(asc(signSigner.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    request: row.request,
    signer: row.signer,
    sandbox: row.mode === "sandbox",
  }));
}

function environmentOf(request: RequestRow, sandbox: boolean) {
  return {
    organizationId: request.organizationId,
    projectId: request.projectId,
    environmentId: request.environmentId,
    mode: sandbox ? ("sandbox" as const) : ("live" as const),
  };
}

/** A fresh link for the signer, valid for `EMAIL_LINK_DAYS` (or until the request expires). */
async function emailLink(due: Due, deps: SignNotificationDeps, now: Date) {
  const days = new Date(now.getTime() + EMAIL_LINK_DAYS * DAY_MS);
  const expiry =
    due.request.expiresAt && due.request.expiresAt < days ? due.request.expiresAt : days;
  return mintSignSession({
    organizationId: due.request.organizationId,
    environmentId: due.request.environmentId,
    requestId: due.request.id,
    signerId: due.signer.id,
    signUrl: deps.signUrl,
    expiresAt: expiry,
    apiKeyId: null,
    now,
  });
}

function brandOf(from: string | null, requester: string): string | undefined {
  return from ? requester : undefined;
}

async function sender(request: RequestRow) {
  const settings = await getSignSettings(request);
  return {
    from: settings.emailFrom,
    requester: oneLine(await requesterName({ organizationId: request.organizationId, settings })),
  };
}

const OPEN_REQUEST = (now: Date) =>
  and(
    eq(signRequest.status, "sent"),
    or(isNull(signRequest.expiresAt), sql`${signRequest.expiresAt} > ${now}`),
  );

const MAX_EMAIL_BACKOFF_MS = 6 * 60 * 60_000;

/**
 * Runs one signer's email; a failure is logged and the signer waits (1, 2, 4… minutes, at most six
 * hours) before the next try, so the rest of the batch and the next passes go on.
 */
async function isolated(item: Due, now: Date, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`[sign] emailing signer ${item.signer.id} failed:`, error);
    const backoff = Math.min(60_000 * 2 ** item.signer.emailFailures, MAX_EMAIL_BACKOFF_MS);
    await db
      .update(signSigner)
      .set({
        emailFailures: sql`${signSigner.emailFailures} + 1`,
        emailRetryAt: new Date(now.getTime() + backoff),
      })
      .where(
        and(
          eq(signSigner.id, item.signer.id),
          eq(signSigner.organizationId, item.signer.organizationId),
        ),
      );
  }
}

/**
 * Invitations: email signers not yet notified, whose turn it is. A `viewed` one without
 * `notified_at` got the invitation (its link is how they opened it) but the worker stopped before
 * recording it: only the bookkeeping is done, so reminders start.
 */
async function invite(now: Date, limit: number, scope: Scope, deps: SignNotificationDeps) {
  const due = await dueSigners(
    and(
      OPEN_REQUEST(now),
      isNull(signSigner.notifiedAt),
      inArray(signSigner.status, ["pending", "viewed"]),
      signersTurn,
      scoped(scope),
    ),
    limit,
    now,
  );
  for (const item of due) {
    await isolated(item, now, async () => {
      const sessionId =
        item.signer.status === "pending" ? await sendInvitation(item, deps, now) : null;
      await db.transaction(async (tx) => {
        await lockRequest(tx, item.request);
        const interval = item.request.reminderIntervalDays;
        const [signer] = await tx
          .update(signSigner)
          .set({
            // Only `pending` becomes `notified`: a signer may have opened (or signed) through the
            // link before this commits.
            status: sql`case when ${signSigner.status} = 'pending' then 'notified'::sign_signer_status else ${signSigner.status} end`,
            notifiedAt: now,
            nextReminderAt: interval ? new Date(now.getTime() + interval * DAY_MS) : null,
            emailFailures: 0,
            emailRetryAt: null,
          })
          .where(
            and(
              eq(signSigner.id, item.signer.id),
              eq(signSigner.organizationId, item.signer.organizationId),
              isNull(signSigner.notifiedAt),
            ),
          )
          .returning();
        if (!signer) return;
        await recordSignEvent(
          tx,
          { request: item.request, signer, sandbox: item.sandbox },
          {
            type: "notified",
            actor: SYSTEM,
            details: sessionId ? { session_id: sessionId } : {},
            occurredAt: now,
          },
        );
      });
    });
  }
  return due.length;
}

/** Emails the invitation; returns the session its link opens. */
async function sendInvitation(
  item: Due,
  deps: SignNotificationDeps,
  now: Date,
): Promise<string | null> {
  const { from, requester } = await sender(item.request);
  const link = await emailLink(item, deps, now);
  const invitation = (message: string | null, brand?: string) =>
    invitationEmail({
      requester,
      title: item.request.title,
      message,
      url: link.url,
      expiresAt: item.request.expiresAt,
      brand,
    });
  // The requester's own words only go out under their own address (or nowhere: a sandbox);
  // coss.com's sender, which the mailer falls back to, always gets the copy without them.
  const content = invitation(
    from || item.sandbox ? item.request.message : null,
    brandOf(from, requester),
  );
  const sent = await deps.mailer.send({
    environment: environmentOf(item.request, item.sandbox),
    from,
    requester,
    to: item.signer.email,
    ...content,
    cossContent: invitation(null),
    idempotencyKey: `sign-invite:${item.signer.id}`,
  });
  return emailedSession(link, sent);
}

/**
 * The session whose link the signer got: this one, unless the send was a replay (an earlier
 * attempt sent it, with a link of its own, before the worker stopped). Then the new session was
 * never emailed: it is deleted, and the audit trail names no session rather than the wrong one.
 */
async function emailedSession(
  link: { id: string },
  sent: { replayed: boolean },
): Promise<string | null> {
  if (!sent.replayed) return link.id;
  await db.delete(signSession).where(eq(signSession.id, link.id));
  return null;
}

/**
 * Locks the request row first, as signing actions do (request, then signer), so recording an
 * email never deadlocks with a signer opening or signing at the same moment.
 */
async function lockRequest(
  tx: Transaction,
  request: { id: string; organizationId: string },
): Promise<void> {
  await tx
    .select({ id: signRequest.id })
    .from(signRequest)
    .where(
      and(eq(signRequest.id, request.id), eq(signRequest.organizationId, request.organizationId)),
    )
    .for("update");
}

/** Reminders: automatic ones when due (up to the limit), and asked-for ones. */
async function remind(now: Date, limit: number, scope: Scope, deps: SignNotificationDeps) {
  const due = await dueSigners(
    and(
      OPEN_REQUEST(now),
      inArray(signSigner.status, ["notified", "viewed"]),
      or(
        isNotNull(signSigner.remindRequestedAt),
        and(
          lte(signSigner.nextReminderAt, now),
          sql`${signSigner.reminderCount} < ${MAX_SIGN_REMINDERS}`,
        ),
      ),
      signersTurn,
      scoped(scope),
    ),
    limit,
    now,
  );
  for (const item of due) {
    await isolated(item, now, async () => {
      const { from, requester } = await sender(item.request);
      const link = await emailLink(item, deps, now);
      // One that was asked for (`requestSignReminders`) doesn't count towards the automatic ones:
      // its key is the time it was asked, the automatic ones' their number.
      const asked = item.signer.remindRequestedAt;
      const count = asked ? item.signer.reminderCount : item.signer.reminderCount + 1;
      const reminder = (brand?: string) =>
        reminderEmail({
          requester,
          title: item.request.title,
          url: link.url,
          expiresAt: item.request.expiresAt,
          brand,
        });
      const sent = await deps.mailer.send({
        environment: environmentOf(item.request, item.sandbox),
        from,
        requester,
        to: item.signer.email,
        ...reminder(brandOf(from, requester)),
        cossContent: reminder(),
        idempotencyKey: asked
          ? `sign-remind:${item.signer.id}:asked:${asked.getTime()}`
          : `sign-remind:${item.signer.id}:${count}`,
      });
      const sessionId = await emailedSession(link, sent);
      await db.transaction(async (tx) => {
        await lockRequest(tx, item.request);
        const interval = item.request.reminderIntervalDays;
        const [signer] = await tx
          .update(signSigner)
          .set({
            reminderCount: count,
            lastRemindedAt: now,
            remindRequestedAt: null,
            emailFailures: 0,
            emailRetryAt: null,
            // An asked-for one moves the next automatic one out by an interval, if one is coming.
            nextReminderAt:
              interval &&
              count < MAX_SIGN_REMINDERS &&
              (!asked || item.signer.nextReminderAt !== null)
                ? new Date(now.getTime() + interval * DAY_MS)
                : null,
          })
          .where(
            and(
              eq(signSigner.id, item.signer.id),
              eq(signSigner.organizationId, item.signer.organizationId),
              eq(signSigner.reminderCount, item.signer.reminderCount),
              asked ? eq(signSigner.remindRequestedAt, asked) : undefined,
            ),
          )
          .returning();
        if (!signer) return;
        await recordSignEvent(
          tx,
          { request: item.request, signer, sandbox: item.sandbox },
          {
            type: "reminded",
            actor: SYSTEM,
            details: sessionId ? { session_id: sessionId } : {},
            occurredAt: now,
          },
        );
      });
    });
  }
  return due.length;
}

/** Signed copies: email signers of sealed requests. */
async function sendCopies(now: Date, limit: number, scope: Scope, deps: SignNotificationDeps) {
  const due = await dueSigners(
    and(
      eq(signRequest.status, "completed"),
      isNotNull(signRequest.sealedAt),
      eq(signSigner.status, "signed"),
      isNull(signSigner.copySentAt),
      scoped(scope),
    ),
    limit,
    now,
  );
  for (const item of due) {
    await isolated(item, now, async () => {
      const { from, requester } = await sender(item.request);
      const document = await readSignedDocument({
        organizationId: item.request.organizationId,
        environmentId: item.request.environmentId,
        requestId: item.request.id,
        store: deps.store,
      });
      const attached = document.content.length <= MAX_ATTACHED_COPY_BYTES;
      // The link opens the signing page's "signed" screen, which downloads the copy.
      const days = new Date(now.getTime() + EMAIL_LINK_DAYS * DAY_MS);
      const link = await mintSignSession({
        organizationId: item.request.organizationId,
        environmentId: item.request.environmentId,
        requestId: item.request.id,
        signerId: item.signer.id,
        signUrl: deps.signUrl,
        expiresAt: days,
        apiKeyId: null,
        now,
      });
      const signedCopy = (brand?: string) =>
        signedCopyEmail({ requester, title: item.request.title, url: link.url, attached, brand });
      const sent = await deps.mailer.send({
        environment: environmentOf(item.request, item.sandbox),
        from,
        requester,
        to: item.signer.email,
        ...signedCopy(brandOf(from, requester)),
        cossContent: signedCopy(),
        idempotencyKey: `sign-copy:${item.signer.id}`,
        attachment: attached ? { filename: document.filename, content: document.content } : null,
      });
      await emailedSession(link, sent);
      await db
        .update(signSigner)
        .set({ copySentAt: now, emailFailures: 0, emailRetryAt: null })
        .where(
          and(
            eq(signSigner.id, item.signer.id),
            eq(signSigner.organizationId, item.signer.organizationId),
            isNull(signSigner.copySentAt),
          ),
        );
    });
  }
  return due.length;
}

/**
 * One pass: expiry, invitations, reminders, copies. A failed email is logged and retried on the
 * next pass. Returns how many things it handled.
 */
export async function runDueSignNotifications(
  opts: { limit: number; now?: Date; scope?: { organizationIds: string[] } },
  deps: SignNotificationDeps,
): Promise<number> {
  const now = opts.now ?? new Date();
  let handled = await expireDue(now, opts.limit, opts.scope);
  for (const step of [invite, remind, sendCopies]) {
    try {
      handled += await step(now, opts.limit, opts.scope, deps);
    } catch (error) {
      console.error(`[sign] ${step.name} failed:`, error);
    }
  }
  return handled;
}

/**
 * Asks for a reminder to every email signer of a sent request whose turn it is and who wasn't
 * emailed in the last hour (`reminder_not_due` when there is nobody). The worker sends it.
 */
export async function requestSignReminders(input: {
  organizationId: string;
  environmentId: string;
  requestId: string;
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();
  const [request] = await db
    .select()
    .from(signRequest)
    .where(
      and(
        eq(signRequest.id, input.requestId),
        eq(signRequest.organizationId, input.organizationId),
        eq(signRequest.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  if (!request) {
    throw new SignError(
      "not_found",
      "No signature request with this id exists in this environment.",
    );
  }
  if (request.status !== "sent") {
    throw new SignError("reminder_not_due", `A ${request.status} request has nobody to remind.`);
  }
  const cutoff = new Date(now.getTime() - REMINDER_COOLDOWN_MS);
  const asked = await db
    .update(signSigner)
    .set({ remindRequestedAt: now })
    .where(
      and(
        eq(signSigner.requestId, request.id),
        eq(signSigner.organizationId, request.organizationId),
        eq(signSigner.delivery, "email"),
        inArray(signSigner.status, ["notified", "viewed"]),
        isNull(signSigner.remindRequestedAt),
        sql`greatest(${signSigner.notifiedAt}, coalesce(${signSigner.lastRemindedAt}, ${signSigner.notifiedAt})) <= ${cutoff}`,
        request.signingOrder === "sequential"
          ? sql`not exists (
              select 1 from ${signSigner} as earlier
              where earlier.request_id = ${request.id}
                and earlier.organization_id = ${request.organizationId}
                and earlier.position < ${signSigner.position}
                and earlier.status <> 'signed')`
          : undefined,
      ),
    )
    .returning({ id: signSigner.id });
  if (asked.length === 0) {
    throw new SignError(
      "reminder_not_due",
      "Nobody to remind: email signers who haven't signed get one at most once an hour, and embedded signers are yours to remind.",
    );
  }
  return asked.length;
}
