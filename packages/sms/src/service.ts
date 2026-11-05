/**
 * Sending SMS: `send` stores a message (and its dispatch job, or `scheduled`), in one transaction
 * with its billing reservation; the worker's `dispatch` claims it (`provider`), screens a live
 * sample and hands it to the provider. Sandbox environments always use the fake provider and skip
 * the sender, country and billing checks.
 */
import { dimensionKey } from "@coss/billing/catalog";
import type { UsageGate } from "@coss/billing/gate";
import {
  BUDGET_EXCEEDED_MESSAGES,
  billingHoldExists,
  budgetHoldExists,
  budgetHoldFor,
} from "@coss/billing/metering";
import {
  HIPAA_MODE_RESTRICTION,
  HIPAA_SMS_COUNTRIES,
  HipaaModeError,
  hipaaModeSql,
  isHipaaMode,
} from "@coss/compliance";
import { db, schema, type Transaction } from "@coss/db";
import { isId } from "@coss/db/id";
import {
  requestHash as hashRequest,
  IDEMPOTENCY_KEY_TTL_MS,
  type IdempotencyErrors,
  isReplayOf,
  withIdempotencyKey,
} from "@coss/db/idempotency";
import { withoutTrailingSlashes } from "@coss/db/url";
import type { ScreenInput, ScreenOutcome } from "@coss/screening";
import { and, asc, eq, inArray, isNull, lte, not, notExists, or, sql } from "drizzle-orm";
import type { SmsDispatchQueue } from "./dispatch.ts";
import { SmsError } from "./errors.ts";
import { COSS_SMS_EVENT_SOURCE, discardSmsBody, recordSmsEvent } from "./events.ts";
import { UNKNOWN_FAILURE } from "./failures.ts";
import { isTollFreeNumber, parsePhoneNumber } from "./phone.ts";
import {
  type SmsProvider,
  type SmsProviderEvent,
  SmsRejectedError,
  type SmsSendResult,
  UncertainSendError,
} from "./provider.ts";
import { SIMULATED_REPLY } from "./providers/fake.ts";
import { currentSms, environmentSms, type SmsRow, toSmsObject } from "./read.ts";
import { storeReceivedSms } from "./received.ts";
import { type SendSmsRequestOutput, SMS_SIMULATOR, type SmsObjectOutput } from "./schemas.ts";
import { countSegments } from "./segments.ts";
import { authorizeLiveSmsSender, type SmsRoute, senderRoute } from "./senders.ts";
import { suppressedNumber } from "./suppressions.ts";

const { environment, organizationDeletion, organizationSuspension, smsMessage } = schema;

/** The authenticated environment a send happens in (from `authenticateApiKey`). */
export type SendEnvironment = {
  organizationId: string;
  projectId: string;
  environmentId: string;
  mode: "live" | "sandbox";
};

export type SendSmsInput = {
  environment: SendEnvironment;
  apiKeyId: string | null;
  /** The member a personal key belongs to (its usage is their spend); `null`: none. */
  apiKeyOwnerId?: string | null;
  params: SendSmsRequestOutput;
  idempotencyKey?: string | null;
  /**
   * The request's W3C `traceparent` (`parseTraceparent`), stored on the message and echoed in its
   * log lines and webhooks. Not part of the request hash: a retry may carry another one.
   */
  traceparent?: string | null;
  /**
   * Internal callers only (Verify): the body is a secret (a one-time code), so it is cleared once
   * the message is sent, failed or canceled. Its history keeps everything else.
   */
  discardBody?: boolean;
};

export type SmsServiceOptions = {
  liveProvider: SmsProvider;
  sandboxProvider: SmsProvider;
  queue: SmsDispatchQueue;
  /** Origin of the API's public routes: providers report delivery to `<it>/sms/twilio/status`. */
  callbackBaseUrl?: string;
  /** Content screening of live messages (`@coss/screening`'s `screenMessage`, wired by the worker). */
  screen?: (input: ScreenInput) => Promise<ScreenOutcome>;
  /** Organizations whose messages go out when screening itself fails. */
  screeningFailureAllowlist?: ReadonlySet<string>;
  /** Plan enforcement (`@coss/billing`): refuses unpriced countries and plans without SMS. */
  billing?: UsageGate;
};

export type DispatchDueOptions = {
  now?: Date;
  limit?: number;
  signal?: AbortSignal;
  scope?: { organizationIds: string[] };
};

export type SmsService = {
  /** Read a matching replay without creating or dispatching anything. */
  replay(input: SendSmsInput): Promise<SmsObjectOutput | null>;
  /** Stores the message; an immediate send enqueues a job, a future one waits as `scheduled`. */
  send(input: SendSmsInput): Promise<{ sms: SmsObjectOutput; replayed: boolean }>;
  /** Hands a queued message to its provider (the worker's dispatch job). Safe to run twice. */
  dispatch(input: { organizationId: string; smsId: string }): Promise<SmsObjectOutput>;
  /** Cancels a scheduled message; an already canceled one is returned as is. */
  cancel(input: {
    organizationId: string;
    environmentId: string;
    smsId: string;
  }): Promise<SmsObjectOutput>;
  /** System-level (worker): sends scheduled messages whose time has come. */
  dispatchDue(opts?: DispatchDueOptions): Promise<number>;
};

const IDEMPOTENCY_ERRORS: IdempotencyErrors = {
  inProgress: () =>
    new SmsError("request_in_progress", "This idempotency key is busy. Retry shortly."),
  reused: () =>
    new SmsError(
      "idempotency_key_reused",
      "This idempotency key was already used with a different request body.",
    ),
};

const CONTENT_REJECTED = {
  code: "content_rejected",
  message: "The message was blocked by content screening.",
};

const SCREENING_UNAVAILABLE = {
  code: "content_screening_unavailable",
  message: "The message was held because content screening was unavailable.",
};

/** A held message is dispatched (and screened) again this long after its screening failed. */
export const SCREENING_RETRY_DELAY_S = 60;

const DISPATCH_DUE_LIMIT = 50;
const DISPATCH_DUE_CONCURRENCY = 5;

/**
 * Fingerprint of a parsed send request, compared when an idempotency key is reused. With
 * `discardBody` the text (a one-time code) is left out: a plain hash of it would let the stored
 * fingerprint confirm guesses; the caller's key names the message on its own.
 */
export function hashSendSmsRequest(
  params: SendSmsRequestOutput,
  opts: { discardBody?: boolean } = {},
): string {
  if (opts.discardBody) {
    const { body: _body, ...rest } = params;
    return hashRequest(rest);
  }
  return hashRequest(params);
}

/** Every `http(s)://…` URL in the text (for screening). */
function linksIn(body: string): string[] {
  return body.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
}

/**
 * Scheduled sends wait while the organization is suspended or on a billing hold, and never go
 * once it is being deleted.
 */
/**
 * The message's organization may send: not suspended, not being deleted and, for live messages
 * (`billing`), not on a billing hold. Sandbox messages skip billing, as they do at acceptance.
 */
/** Live scheduled messages also wait while a budget of their project, key or member is used up. */
function withinBudget() {
  return not(
    budgetHoldExists({
      organizationId: smsMessage.organizationId,
      projectId: smsMessage.projectId,
      apiKeyId: smsMessage.apiKeyId,
      userId: smsMessage.apiKeyOwnerId,
    }),
  );
}

function organizationActive(opts: { billing: boolean }) {
  return and(
    opts.billing ? not(billingHoldExists(smsMessage.organizationId)) : undefined,
    notExists(
      db
        .select({ id: organizationSuspension.organizationId })
        .from(organizationSuspension)
        .where(eq(organizationSuspension.organizationId, smsMessage.organizationId)),
    ),
    notExists(
      db
        .select({ id: organizationDeletion.id })
        .from(organizationDeletion)
        .where(
          and(
            eq(organizationDeletion.organizationId, smsMessage.organizationId),
            eq(organizationDeletion.status, "pending"),
          ),
        ),
    ),
  );
}

/** A message-level event coss.com itself records. */
function cossEvent(
  row: SmsRow,
  event: Pick<SmsProviderEvent, "type" | "providerStatus" | "sourceId" | "data">,
): SmsProviderEvent {
  return {
    ...event,
    provider: COSS_SMS_EVENT_SOURCE,
    smsId: row.id,
    providerMessageId: null,
    occurredAt: new Date(),
  };
}

function failedEvent(
  row: SmsRow,
  failure: { code: string; message: string },
  providerErrorCode: string | null = null,
): SmsProviderEvent {
  return cossEvent(row, {
    type: "sms.failed",
    providerStatus: "rejected",
    sourceId: failure.code,
    data: { failure, ...(providerErrorCode ? { provider_error_code: providerErrorCode } : {}) },
  });
}

/** HIPAA mode may have been turned on while a message waited: its body still isn't kept. */
function hipaaAtClaim(sandbox: boolean, organizationId: string) {
  if (sandbox) return {};
  return {
    discardBody: sql<boolean>`(${smsMessage.discardBody} or ${hipaaModeSql(organizationId)})`,
  };
}

export function createSmsService(opts: SmsServiceOptions): SmsService {
  const callbackBaseUrl = opts.callbackBaseUrl && withoutTrailingSlashes(opts.callbackBaseUrl);
  // Sandbox environments never reach a real provider, whatever `liveProvider` is.
  const providerFor = (sandbox: boolean) => (sandbox ? opts.sandboxProvider : opts.liveProvider);

  /** Why content screening refuses a live message. Unexpected enforcement failures fail closed. */
  async function screeningFailure(
    row: SmsRow,
    sandbox: boolean,
  ): Promise<typeof CONTENT_REJECTED | typeof SCREENING_UNAVAILABLE | null> {
    if (sandbox || !opts.screen) return null;
    try {
      const outcome = await opts.screen({
        organizationId: row.organizationId,
        environmentId: row.environmentId,
        product: "sms",
        subjectId: row.id,
        content: () => ({ kind: "sms", from: row.from, body: row.body, links: linksIn(row.body) }),
        retry: row.errorCode === SCREENING_UNAVAILABLE.code,
      });
      if (outcome.action !== "block") return null;
      return outcome.screening?.verdict === "error" ? SCREENING_UNAVAILABLE : CONTENT_REJECTED;
    } catch (error) {
      console.error(`[sms] content screening failed for ${row.id}:`, error);
      return opts.screeningFailureAllowlist?.has(row.organizationId) ? null : SCREENING_UNAVAILABLE;
    }
  }

  /** Gives the claim back and dispatches the message again in `SCREENING_RETRY_DELAY_S`. */
  async function holdForScreening(row: SmsRow, provider: SmsProvider): Promise<void> {
    await db.transaction(async (tx) => {
      const [held] = await tx
        .update(smsMessage)
        .set({
          provider: null,
          errorCode: SCREENING_UNAVAILABLE.code,
          errorMessage: SCREENING_UNAVAILABLE.message,
        })
        .where(
          and(
            eq(smsMessage.id, row.id),
            eq(smsMessage.organizationId, row.organizationId),
            eq(smsMessage.status, "queued"),
            eq(smsMessage.provider, provider.name),
          ),
        )
        .returning({ id: smsMessage.id });
      if (held) {
        await opts.queue.enqueue(
          tx,
          { organizationId: row.organizationId, smsId: row.id },
          { delaySeconds: SCREENING_RETRY_DELAY_S },
        );
      }
    });
  }

  /** Records the outcome of a claimed message, guarded on `queued` (a callback may have won). */
  async function finish(
    row: SmsRow,
    outcome: Partial<SmsRow>,
    events: SmsProviderEvent[],
    sandbox: boolean,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(smsMessage)
        .set(outcome)
        .where(
          and(
            eq(smsMessage.id, row.id),
            eq(smsMessage.organizationId, row.organizationId),
            eq(smsMessage.status, "queued"),
          ),
        )
        .returning({ id: smsMessage.id });
      // A failure only counts if it is the recorded outcome; provider events are facts either way.
      if (!updated && outcome.status === "failed") return;
      if (updated) await discardSmsBody(tx, row);
      for (const event of events) await recordSmsEvent(tx, event);
      if (updated && outcome.status === "sent" && sandbox && row.to === SMS_SIMULATOR.reply) {
        // The simulator answers: a received message in the sender's own (sandbox) environment.
        await storeReceivedSms(
          tx,
          {
            organizationId: row.organizationId,
            projectId: row.projectId,
            environmentId: row.environmentId,
            sandbox: true,
          },
          {
            numberId: null,
            from: row.to,
            to: row.from,
            body: SIMULATED_REPLY,
            country: row.toCountry,
            provider: "fake",
            providerMessageId: `reply-${row.id}`,
            occurredAt: new Date(),
          },
        );
      }
    });
  }

  /** Sends a message this process claimed for `provider` and records the outcome. */
  async function complete(row: SmsRow, provider: SmsProvider, sandbox: boolean): Promise<void> {
    // A message accepted before the organization turned HIPAA mode on.
    if (
      !sandbox &&
      !HIPAA_SMS_COUNTRIES.includes(row.toCountry) &&
      (await isHipaaMode(row.organizationId))
    ) {
      const failure = {
        code: HIPAA_MODE_RESTRICTION,
        message: `HIPAA mode only sends SMS to ${HIPAA_SMS_COUNTRIES.join(", ")} numbers.`,
      };
      await finish(
        row,
        { status: "failed", errorCode: failure.code, errorMessage: failure.message },
        [failedEvent(row, failure)],
        sandbox,
      );
      return;
    }
    const screening = await screeningFailure(row, sandbox);
    if (screening === SCREENING_UNAVAILABLE) {
      await holdForScreening(row, provider);
      return;
    }
    if (screening) {
      await finish(
        row,
        { status: "failed", errorCode: screening.code, errorMessage: screening.message },
        [failedEvent(row, screening)],
        sandbox,
      );
      return;
    }
    let route: SmsRoute | null = null;
    if (!sandbox) {
      route = row.numberId ? await senderRoute(row.organizationId, row.numberId) : null;
      if (!route) {
        const failure = {
          code: "sender_unavailable",
          message: "The number the message was sent from was released before it went out.",
        };
        await finish(
          row,
          { status: "failed", errorCode: failure.code, errorMessage: failure.message },
          [failedEvent(row, failure)],
          sandbox,
        );
        return;
      }
    }
    let result: SmsSendResult;
    try {
      result = await provider.send({
        smsId: row.id,
        organizationId: row.organizationId,
        from: row.from,
        to: row.to,
        body: row.body,
        statusCallbackUrl:
          callbackBaseUrl && !sandbox
            ? `${callbackBaseUrl}/sms/twilio/status?sms_id=${encodeURIComponent(row.id)}`
            : null,
        route,
      });
    } catch (error) {
      if (error instanceof UncertainSendError) {
        // The provider may be sending it: never fail it here, and never send it again. It stays
        // claimed; the provider's status callback or the stale-claim sweep settles it.
        console.error(`[sms] provider "${provider.name}" may have sent ${row.id}:`, error);
        return;
      }
      const rejected = error instanceof SmsRejectedError ? error : null;
      if (!rejected) {
        console.error(`[sms] provider "${provider.name}" failed to send ${row.id}:`, error);
      }
      const failure = rejected?.failure ?? UNKNOWN_FAILURE;
      const event = failedEvent(row, failure, rejected?.providerErrorCode ?? null);
      if (rejected?.suppress) event.suppress = rejected.suppress;
      await finish(
        row,
        { status: "failed", errorCode: failure.code, errorMessage: failure.message },
        [event],
        sandbox,
      );
      return;
    }
    // Accepted: a failure to record it from here on is not the provider's refusal. It throws, and
    // the message stays claimed for the status callback or the stale-claim sweep.
    await finish(
      row,
      {
        status: "sent",
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
        // A held message that got through on a retry.
        errorCode: null,
        errorMessage: null,
      },
      result.events ?? [],
      sandbox,
    );
  }

  /**
   * In the claim's transaction: a number suppressed since the message was accepted (a STOP while
   * it waited in the queue, for screening or for its time) fails it with `sms.suppressed` instead
   * of sending. True when it did.
   */
  async function suppressedAtClaim(tx: Transaction, row: SmsRow): Promise<boolean> {
    const suppression = await suppressedNumber(tx, row, row.to);
    if (!suppression) return false;
    await tx
      .update(smsMessage)
      .set({
        status: "failed",
        errorCode: "suppressed",
        errorMessage: "The number is on the environment's SMS suppression list.",
      })
      .where(and(eq(smsMessage.id, row.id), eq(smsMessage.organizationId, row.organizationId)));
    await recordSmsEvent(tx, suppressedEvent(row, suppression));
    return true;
  }

  async function deliver(row: SmsRow, sandbox: boolean): Promise<SmsObjectOutput> {
    if (row.status !== "queued") return currentSms(row);
    const provider = providerFor(sandbox);
    // Claim first so concurrent dispatchers (a retried job) never send it twice. A crash after the
    // claim leaves it `queued` with a provider: the stale-claim sweep resolves it.
    const claimed = await db.transaction(async (tx) => {
      const [claimedRow] = await tx
        .update(smsMessage)
        .set({ provider: provider.name, ...hipaaAtClaim(sandbox, row.organizationId) })
        .where(
          and(
            eq(smsMessage.id, row.id),
            eq(smsMessage.organizationId, row.organizationId),
            eq(smsMessage.status, "queued"),
            isNull(smsMessage.provider),
          ),
        )
        .returning();
      if (!claimedRow) return undefined;
      return (await suppressedAtClaim(tx, claimedRow)) ? undefined : claimedRow;
    });
    if (claimed) await complete(claimed, provider, sandbox);
    return currentSms(row);
  }

  async function dispatch(input: {
    organizationId: string;
    smsId: string;
  }): Promise<SmsObjectOutput> {
    const [found] = isId("sms", input.smsId)
      ? await db
          .select({ sms: smsMessage, mode: environment.mode })
          .from(smsMessage)
          .innerJoin(
            environment,
            and(
              eq(environment.id, smsMessage.environmentId),
              eq(environment.organizationId, smsMessage.organizationId),
            ),
          )
          .where(
            and(
              eq(smsMessage.organizationId, input.organizationId),
              eq(smsMessage.id, input.smsId),
            ),
          )
          .limit(1)
      : [];
    if (!found) throw new SmsError("not_found", "SMS not found.");
    return deliver(found.sms, found.mode === "sandbox");
  }

  /** Records a refused scheduled message (`sms.failed`) if it is still due. */
  async function failScheduled(row: SmsRow, error: SmsError, stillDue: ReturnType<typeof and>) {
    await db.transaction(async (tx) => {
      const [failed] = await tx
        .update(smsMessage)
        .set({ status: "failed", errorCode: error.code, errorMessage: error.message })
        .where(stillDue)
        .returning({ id: smsMessage.id });
      if (!failed) return;
      await recordSmsEvent(
        tx,
        cossEvent(row, {
          type: "sms.failed",
          providerStatus: "SenderRejected",
          sourceId: error.code,
          data: { failure: { code: error.code, message: error.message } },
        }),
      );
    });
  }

  /**
   * Hands one due scheduled message to its provider. The sender and the suppression list are
   * checked again: either may have changed since it was scheduled.
   */
  async function dispatchScheduled(row: SmsRow, sandbox: boolean, now: Date): Promise<void> {
    const provider = providerFor(sandbox);
    const stillDue = and(
      eq(smsMessage.id, row.id),
      eq(smsMessage.organizationId, row.organizationId),
      eq(smsMessage.status, "scheduled"),
      isNull(smsMessage.provider),
      lte(smsMessage.scheduledAt, now),
      organizationActive({ billing: !sandbox }),
      sandbox ? undefined : withinBudget(),
    );
    if (!sandbox) {
      try {
        await authorizeLiveSmsSender({
          organizationId: row.organizationId,
          from: row.from,
          toCountry: row.toCountry,
          provider: provider.name,
        });
      } catch (error) {
        if (!(error instanceof SmsError)) throw error;
        // Held, not failed: it goes once the hold is lifted (like a suspension).
        if (error.code === "billing_hold") return;
        await failScheduled(row, error, stillDue);
        return;
      }
    }
    const claimed = await db.transaction(async (tx) => {
      const [claimedRow] = await tx
        .update(smsMessage)
        .set({
          status: "queued",
          provider: provider.name,
          ...hipaaAtClaim(sandbox, row.organizationId),
        })
        .where(stillDue)
        .returning();
      if (!claimedRow) return undefined;
      return (await suppressedAtClaim(tx, claimedRow)) ? undefined : claimedRow;
    });
    if (claimed) await complete(claimed, provider, sandbox);
  }

  async function dispatchDue(due: DispatchDueOptions = {}): Promise<number> {
    const now = due.now ?? new Date();
    const rows = await db
      .select({ sms: smsMessage, mode: environment.mode })
      .from(smsMessage)
      .innerJoin(
        environment,
        and(
          eq(environment.id, smsMessage.environmentId),
          eq(environment.organizationId, smsMessage.organizationId),
        ),
      )
      .where(
        and(
          eq(smsMessage.status, "scheduled"),
          lte(smsMessage.scheduledAt, now),
          organizationActive({ billing: false }),
          or(
            eq(environment.mode, "sandbox"),
            and(not(billingHoldExists(smsMessage.organizationId)), withinBudget()),
          ),
          due.scope ? inArray(smsMessage.organizationId, due.scope.organizationIds) : undefined,
        ),
      )
      .orderBy(asc(smsMessage.scheduledAt))
      .limit(due.limit ?? DISPATCH_DUE_LIMIT);
    for (let offset = 0; offset < rows.length; offset += DISPATCH_DUE_CONCURRENCY) {
      if (due.signal?.aborted) break;
      const batch = rows.slice(offset, offset + DISPATCH_DUE_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((row) => dispatchScheduled(row.sms, row.mode === "sandbox", now)),
      );
      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") {
          console.error(
            `[sms] dispatching scheduled ${batch[index]?.sms.id} failed:`,
            result.reason,
          );
        }
      }
    }
    return rows.length;
  }

  /** The message an unexpired idempotency key with the same request hash points at. */
  async function findReplay(
    environment: SendEnvironment,
    idempotencyKey: string,
    requestHash: string | null,
  ): Promise<SmsObjectOutput | null> {
    const [existing] = await db
      .select()
      .from(smsMessage)
      .where(sameKey(environment, idempotencyKey))
      .limit(1);
    if (!existing || !isReplayOf(existing, requestHash)) return null;
    return toSmsObject(existing, environment.mode === "sandbox");
  }

  async function send(input: SendSmsInput): Promise<{ sms: SmsObjectOutput; replayed: boolean }> {
    const { environment: env, params } = input;
    const sandbox = env.mode === "sandbox";
    const idempotencyKey = input.idempotencyKey || null;
    const hipaaMode = !sandbox && (await isHipaaMode(env.organizationId));
    const discardBody = input.discardBody || hipaaMode;
    const requestHash = idempotencyKey ? hashSendSmsRequest(params, { discardBody }) : null;
    const replayOnError = async (error: unknown) => {
      // A retry of a request that already succeeded still replays, even if its sender changed since.
      const replay =
        error instanceof SmsError &&
        idempotencyKey &&
        (await findReplay(env, idempotencyKey, requestHash));
      if (replay) return { sms: replay, replayed: true };
      throw error;
    };

    const to = parsePhoneNumber(params.to);
    if (!to) {
      return replayOnError(
        new SmsError("invalid_phone_number", `${params.to} isn't a valid phone number.`, {
          param: "to",
        }),
      );
    }
    if (hipaaMode && !HIPAA_SMS_COUNTRIES.includes(to.country)) {
      throw new HipaaModeError(
        `HIPAA mode only sends SMS to ${HIPAA_SMS_COUNTRIES.join(", ")} numbers, which is what the BAA with Twilio covers.`,
      );
    }
    let numberId: string | null = null;
    if (!sandbox) {
      try {
        const sender = await authorizeLiveSmsSender({
          organizationId: env.organizationId,
          from: params.from,
          toCountry: to.country,
          provider: opts.liveProvider.name,
        });
        numberId = sender.numberId;
        const held = await budgetHoldFor({
          organizationId: env.organizationId,
          projectId: env.projectId,
          apiKeyId: input.apiKeyId,
          userId: input.apiKeyOwnerId,
        });
        if (held) throw new SmsError("budget_exceeded", BUDGET_EXCEEDED_MESSAGES[held]);
      } catch (error) {
        return replayOnError(error);
      }
    }
    const segmentation = countSegments(params.body, { tollFree: isTollFreeNumber(params.from) });
    const scheduledAt =
      params.scheduled_at && Date.parse(params.scheduled_at) > Date.now()
        ? new Date(params.scheduled_at)
        : null;

    const insert = async (tx: Transaction): Promise<SmsRow | undefined> => {
      const [row] = await tx
        .insert(smsMessage)
        .values({
          organizationId: env.organizationId,
          projectId: env.projectId,
          environmentId: env.environmentId,
          apiKeyId: input.apiKeyId,
          apiKeyOwnerId: input.apiKeyOwnerId ?? null,
          status: scheduledAt ? "scheduled" : "queued",
          from: params.from,
          to: to.phoneNumber,
          toCountry: to.country,
          numberId,
          body: params.body,
          discardBody: discardBody ?? false,
          encoding: segmentation.encoding,
          segments: segmentation.segments,
          tags: params.tags ?? [],
          scheduledAt,
          idempotencyKey,
          requestHash,
          traceparent: input.traceparent ?? null,
        })
        .onConflictDoNothing({ target: [smsMessage.environmentId, smsMessage.idempotencyKey] })
        .returning();
      if (!row) return undefined;
      const suppression = await suppressedNumber(tx, env, row.to);
      if (suppression) {
        // Skipped, never handed over and never billed.
        const [failed] = await tx
          .update(smsMessage)
          .set({
            status: "failed",
            errorCode: "suppressed",
            errorMessage: "The number is on the environment's SMS suppression list.",
          })
          .where(and(eq(smsMessage.id, row.id), eq(smsMessage.organizationId, row.organizationId)))
          .returning();
        await recordSmsEvent(tx, suppressedEvent(row, suppression));
        return failed;
      }
      if (scheduledAt) {
        await recordSmsEvent(
          tx,
          cossEvent(row, {
            type: "sms.scheduled",
            providerStatus: "Scheduled",
            sourceId: "scheduled",
            data: {},
          }),
        );
      } else {
        await opts.queue.enqueue(tx, { organizationId: row.organizationId, smsId: row.id });
      }
      // Plan and country pricing, as the transaction's last statement.
      if (!sandbox && opts.billing) {
        await opts.billing.reserve(tx, {
          organizationId: env.organizationId,
          meter: "sms.segments",
          quantity: row.segments,
          dimension: dimensionKey({ country: row.toCountry }),
        });
      }
      return row;
    };

    if (!idempotencyKey || !requestHash) {
      const row = await db.transaction((tx) => insert(tx));
      if (!row) throw new Error("SMS insert returned no row.");
      return { sms: toSmsObject(row, sandbox), replayed: false };
    }
    const { row, replayed } = await withIdempotencyKey({
      requestHash,
      retentionMs: IDEMPOTENCY_KEY_TTL_MS,
      errors: IDEMPOTENCY_ERRORS,
      insert,
      existing: async () => {
        const [existing] = await db
          .select()
          .from(smsMessage)
          .where(sameKey(env, idempotencyKey))
          .limit(1);
        return existing;
      },
      release: (tx, existing) =>
        tx
          .update(smsMessage)
          .set({ idempotencyKey: null })
          .where(
            and(eq(smsMessage.id, existing.id), eq(smsMessage.idempotencyKey, idempotencyKey)),
          ),
    });
    return { sms: toSmsObject(row, sandbox), replayed };
  }

  async function replay(input: SendSmsInput): Promise<SmsObjectOutput | null> {
    if (!input.idempotencyKey) return null;
    const hipaaMode =
      input.environment.mode !== "sandbox" && (await isHipaaMode(input.environment.organizationId));
    return findReplay(
      input.environment,
      input.idempotencyKey,
      hashSendSmsRequest(input.params, { discardBody: input.discardBody || hipaaMode }),
    );
  }

  return { send, replay, dispatch, cancel: cancelScheduledSms, dispatchDue };
}

function sameKey(environment: SendEnvironment, idempotencyKey: string) {
  return and(
    eq(smsMessage.organizationId, environment.organizationId),
    eq(smsMessage.environmentId, environment.environmentId),
    eq(smsMessage.idempotencyKey, idempotencyKey),
  );
}

function suppressedEvent(
  row: SmsRow,
  suppression: { id: string; reason: "opt_out" | "manual" | "invalid_number" },
): SmsProviderEvent {
  return cossEvent(row, {
    type: "sms.suppressed",
    providerStatus: "Suppressed",
    sourceId: suppression.id,
    data: { suppression: { id: suppression.id, reason: suppression.reason } },
  });
}

/** Cancels a scheduled message (`sms.canceled`); any other status but `canceled` is refused. */
export async function cancelScheduledSms(input: {
  organizationId: string;
  environmentId: string;
  smsId: string;
}): Promise<SmsObjectOutput> {
  const { sms: row } = await environmentSms(input);
  await db.transaction(async (tx) => {
    const [canceled] = await tx
      .update(smsMessage)
      .set({ status: "canceled" })
      .where(
        and(
          eq(smsMessage.id, row.id),
          eq(smsMessage.organizationId, row.organizationId),
          eq(smsMessage.status, "scheduled"),
          isNull(smsMessage.provider),
        ),
      )
      .returning({ id: smsMessage.id });
    if (!canceled) return;
    await recordSmsEvent(
      tx,
      cossEvent(row, {
        type: "sms.canceled",
        providerStatus: "Canceled",
        sourceId: "canceled",
        data: {},
      }),
    );
  });
  const current = await currentSms(row);
  if (current.status !== "canceled") {
    throw new SmsError(
      "sms_not_cancelable",
      `Only scheduled messages can be canceled; this one is ${current.status}.`,
    );
  }
  return current;
}
