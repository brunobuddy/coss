/**
 * Verify: `start` sends a one-time code to a phone number or an email address, `check` compares
 * what the end user typed. Before a new verification costs anything, the fraud guard
 * (`@coss/risk`'s `checkVerificationRisk`) and the destination's rate limits run; a blocked one is
 * stored (`blocked`, with its reasons) and nothing is sent. Codes exist only as HMACs. SMS codes go
 * from the environment's own number (`sms_from`) or coss.com's shared numbers (in coss.com's own
 * environment, billed to the organization as `verify.sms`); email through the injected sender.
 */
import { createHash } from "node:crypto";
import { dimensionKey } from "@coss/billing/catalog";
import type { UsageGate } from "@coss/billing/gate";
import {
  BUDGET_EXCEEDED_MESSAGES,
  budgetHoldFor,
  isOnBillingHold,
  recordUsage,
} from "@coss/billing/metering";
import { HIPAA_SMS_COUNTRIES, HipaaModeError, isHipaaMode } from "@coss/compliance";
import { db, type Executor, schema, type Transaction } from "@coss/db";
import { ID_PREFIXES, isId, newId } from "@coss/db/id";
import { requestHash as hashRequest } from "@coss/db/idempotency";
import {
  type RateLimitDecision,
  type RateLimiter,
  type RateLimitRequest,
  verifyCheckQuota,
  verifyDestinationQuota,
  verifySharedSmsQuota,
} from "@coss/ratelimit";
import { isSuspended } from "@coss/reputation";
import {
  checkVerificationRisk,
  type RiskDeps,
  recordVerificationApproval,
  uncountVerificationStart,
  type VerificationDestination,
  type VerificationRisk,
} from "@coss/risk";
import { emailSyntaxProblem } from "@coss/signals/email";
import {
  isHighRiskSmsCountry,
  isTollFreeNumber,
  parsePhoneNumber,
  phoneNumberType,
  type SendEnvironment,
  type SmsService,
  TOLL_FREE_SMS_COUNTRIES,
} from "@coss/sms";
import { countSegments } from "@coss/sms/segments";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { codeMatches, deriveCode, hashCode } from "./codes.ts";
import { VerifyError } from "./errors.ts";
import { recordVerifyEvent } from "./events.ts";
import { verifyEmailContent, verifySmsText } from "./messages.ts";
import { type VerifyRequestRow, verificationObject } from "./read.ts";
import {
  type CheckVerificationRequestOutput,
  MAX_SENDS,
  type StartVerificationRequestOutput,
  type VerificationCheckOutput,
  type VerificationObjectOutput,
  type VerifySendRoute,
} from "./schemas.ts";
import { getVerifySettings, type ResolvedVerifySettings } from "./settings.ts";

const { smsMessage, verifyCheck, verifyRequest, verifySend } = schema;

/** Who a send is for, as far as spend goes: the API key and its owner, if a member's. */
type SpendSource = { apiKeyId: string | null; apiKeyOwnerId: string | null };

function sourceOf(input: StartVerificationInput): SpendSource {
  return { apiKeyId: input.apiKeyId, apiKeyOwnerId: input.apiKeyOwnerId ?? null };
}

/** The SMS an idempotency key made in an environment (a send's, whatever organization it is). */
async function smsByKey(
  environmentId: string,
  idempotencyKey: string,
): Promise<{ id: string } | undefined> {
  const [found] = await db
    .select({ id: smsMessage.id })
    .from(smsMessage)
    .where(
      and(
        eq(smsMessage.environmentId, environmentId),
        eq(smsMessage.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return found;
}

/** Another request with the same Idempotency-Key claimed the send first. */
class KeyTaken extends Error {}

/** The destination's pending verification ended between the first look and the lock. */
class PendingChanged extends Error {}

/** A send that never got a message this long after its claim is sent again by a retry. */
const RECOVER_SEND_AFTER_MS = 30_000;

function tooManySends(row: { id: string }): VerifyError {
  return new VerifyError(
    "too_many_sends",
    `The code was already sent ${MAX_SENDS} times; wait for it to expire.`,
    { verificationId: row.id },
  );
}

/** The destination's pending, unexpired verification (the latest). */
async function pendingFor(
  executor: Executor,
  env: VerifyEnvironment,
  destination: { to: string; channel: "sms" | "email" },
): Promise<VerifyRequestRow | undefined> {
  const [pending] = await executor
    .select()
    .from(verifyRequest)
    .where(
      and(
        eq(verifyRequest.organizationId, env.organizationId),
        eq(verifyRequest.environmentId, env.environmentId),
        eq(verifyRequest.to, destination.to),
        eq(verifyRequest.channel, destination.channel),
        eq(verifyRequest.status, "pending"),
        gt(verifyRequest.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(verifyRequest.createdAt))
    .limit(1);
  return pending;
}

/** The authenticated environment (from `authenticateApiKey`). */
export type VerifyEnvironment = SendEnvironment;

/** Sandbox SMS codes "come from" this simulator number (sandbox sends accept any). */
export const SANDBOX_VERIFY_FROM = "+15005550000";

/** Sends a code by email (the API's: the environment's sender, else coss.com's). */
export type VerifyEmailSender = (input: {
  environment: VerifyEnvironment;
  apiKeyId: string | null;
  /** The member a personal key belongs to (its usage is their spend); `null`: none. */
  apiKeyOwnerId: string | null;
  /** The settings' sender; `null`: coss.com's. */
  from: string | null;
  appName: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  cossHtml: string;
  idempotencyKey: string;
  /** `suppressed`: nothing was sent (`emailId` is then `null`). */
}) => Promise<{ route: "email" | "coss_email"; emailId: string | null; suppressed: boolean }>;

/** coss.com's shared numbers: a live environment of coss.com's own organization and its numbers. */
export type SharedSmsSender = { environment: VerifyEnvironment; numbers: readonly string[] };

export type VerifyServiceOptions = {
  risk: RiskDeps;
  /** `verifyCodeKey(RISK_HASH_KEY)`. */
  codeKey: Uint8Array;
  sms: SmsService;
  /** `null`: no shared numbers (live SMS needs the environment's own `sms_from`). */
  sharedSms?: SharedSmsSender | null;
  /** `null`: no email channel. */
  sendEmail?: VerifyEmailSender | null;
  /** Plan enforcement and capped meters (`@coss/billing`). */
  billing?: UsageGate;
  /** Destination and shared-number quotas; without it, none. */
  limiter?: RateLimiter;
};

export type StartVerificationInput = {
  environment: VerifyEnvironment;
  apiKeyId: string | null;
  /** The member a personal key belongs to (its usage is their spend); `null`: none. */
  apiKeyOwnerId?: string | null;
  params: StartVerificationRequestOutput;
  idempotencyKey?: string | null;
};

export type CheckVerificationInput = {
  environment: VerifyEnvironment;
  params: CheckVerificationRequestOutput;
  idempotencyKey?: string | null;
};

export type VerifyService = {
  start(
    input: StartVerificationInput,
  ): Promise<{ verification: VerificationObjectOutput; replayed: boolean }>;
  check(input: CheckVerificationInput): Promise<VerificationCheckOutput>;
  cancel(input: {
    environment: VerifyEnvironment;
    verificationId: string;
  }): Promise<VerificationObjectOutput>;
};

type Destination =
  | { channel: "sms"; to: string; country: string; lineType: string }
  | { channel: "email"; to: string; country: null };

type Route = VerifySendRoute;

function riskDestination(destination: Destination): VerificationDestination {
  return destination.channel === "sms"
    ? {
        channel: "sms",
        phoneNumber: destination.to,
        country: destination.country,
        lineType: destination.lineType,
      }
    : { channel: "email", address: destination.to };
}

function quotaError(decision: RateLimitDecision, message: string): VerifyError {
  return new VerifyError("quota_exceeded", message, {
    decision: {
      bucket: decision.bucket,
      limit: decision.limit,
      remaining: decision.remaining,
      resetMs: decision.resetMs,
      retryAfterMs: decision.retryAfterMs,
    },
  });
}

/** Spreads destinations over the shared numbers, the same number for the same destination. */
function pickSharedNumber(numbers: readonly string[], to: string, country: string): string | null {
  const candidates = numbers.filter(
    (number) => !isTollFreeNumber(number) || TOLL_FREE_SMS_COUNTRIES.includes(country),
  );
  if (candidates.length === 0) return null;
  const index = createHash("sha256").update(to).digest().readUInt32BE(0) % candidates.length;
  return candidates[index] ?? null;
}

export function createVerifyService(opts: VerifyServiceOptions): VerifyService {
  async function consume(request: RateLimitRequest, message: string): Promise<() => Promise<void>> {
    if (!opts.limiter) return async () => {};
    const limiter = opts.limiter;
    const decision = await limiter.consume(request);
    if (!decision.allowed) throw quotaError(decision, message);
    return () => limiter.refund(request);
  }

  /** Parses `to` and applies the environment's countries; the route the code would take. */
  function destinationOf(
    env: VerifyEnvironment,
    params: StartVerificationRequestOutput,
    settings: ResolvedVerifySettings,
  ): { destination: Destination; route: Route } {
    if (params.channel === "email") {
      if (emailSyntaxProblem(params.to)) {
        throw new VerifyError("invalid_destination", "Not a valid email address.", { param: "to" });
      }
      return {
        destination: { channel: "email", to: params.to, country: null },
        route: settings.emailFrom || env.mode === "sandbox" ? "email" : "coss_email",
      };
    }
    const parsed = parsePhoneNumber(params.to);
    if (!parsed) {
      throw new VerifyError("invalid_destination", `${params.to} isn't a valid phone number.`, {
        param: "to",
      });
    }
    const route: Route = settings.smsFrom ? "own_number" : "shared_number";
    if (!settings.allowedCountries.includes(parsed.country)) {
      throw new VerifyError(
        "country_not_allowed",
        `Codes can't be sent to ${parsed.country} numbers: allow the country in Verify's settings.`,
        { param: "to" },
      );
    }
    if (env.mode === "live" && route === "shared_number") {
      if (isHighRiskSmsCountry(parsed.country)) {
        throw new VerifyError(
          "country_not_allowed",
          `coss.com's shared numbers don't send to ${parsed.country}; send from your own number.`,
          { param: "to" },
        );
      }
      if (!opts.sharedSms) {
        throw new VerifyError(
          "shared_sender_unavailable",
          "coss.com's shared numbers aren't available: set an SMS sender in Verify's settings.",
        );
      }
    }
    return {
      destination: {
        channel: "sms",
        to: parsed.phoneNumber,
        country: parsed.country,
        lineType: phoneNumberType(parsed.phoneNumber),
      },
      route,
    };
  }

  /** The verification as the API shows it, read again. */
  async function current(row: Pick<VerifyRequestRow, "id" | "organizationId">, sandbox: boolean) {
    const [fresh] = await db
      .select()
      .from(verifyRequest)
      .where(
        and(eq(verifyRequest.id, row.id), eq(verifyRequest.organizationId, row.organizationId)),
      )
      .limit(1);
    if (!fresh) throw new VerifyError("not_found", "Verification not found.");
    return verificationObject(fresh, sandbox);
  }

  /**
   * Ends a verification whose send `sendNumber` couldn't go out (`failed`), unless a newer send
   * was claimed since: its code is the one that counts.
   */
  async function failSend(
    row: VerifyRequestRow,
    sandbox: boolean,
    failureCode: string,
    sendNumber: number,
  ) {
    await db.transaction(async (tx) => {
      const [failed] = await tx
        .update(verifyRequest)
        .set({ status: "failed", failureCode, codeHash: null })
        .where(
          and(
            eq(verifyRequest.id, row.id),
            eq(verifyRequest.organizationId, row.organizationId),
            eq(verifyRequest.status, "pending"),
            eq(verifyRequest.sends, sendNumber),
          ),
        )
        .returning();
      if (failed) await recordVerifyEvent(tx, failed, "failed", { sandbox });
    });
  }

  /** Where send messages go: the SMS's environment (coss.com's for shared numbers), else none. */
  function messageEnvironmentFor(env: VerifyEnvironment, channel: string, route: Route) {
    if (channel !== "sms") return null;
    if (route === "shared_number" && env.mode === "live" && opts.sharedSms) {
      return opts.sharedSms.environment.environmentId;
    }
    return env.environmentId;
  }

  /**
   * Sends send number `sendNumber` (claimed, with its `verify_send` row, by the caller's
   * transaction) and records what went out. Its code is derived from the send, and the channel's
   * idempotency key is the send's, so sending it again (a retry after a crash) sends nothing new.
   * `recovering`: a replay finishing a send that may be in flight; its errors fail nothing.
   */
  async function deliver(
    env: VerifyEnvironment,
    source: SpendSource,
    row: VerifyRequestRow,
    route: Route,
    settings: ResolvedVerifySettings,
    sendNumber: number,
    recovering = false,
  ): Promise<void> {
    const sandbox = env.mode === "sandbox";
    const idempotencyKey = `${row.id}:send:${sendNumber}`;
    const code = deriveCode(opts.codeKey, row.id, sendNumber, row.codeLength, sandbox);
    let sent: { smsId?: string; emailId?: string; route: Route };
    try {
      if (row.channel === "sms") {
        const shared = route === "shared_number" && !sandbox;
        const sharedSms = opts.sharedSms;
        const from = shared
          ? sharedSms && pickSharedNumber(sharedSms.numbers, row.to, row.toCountry ?? "")
          : (settings.smsFrom ?? SANDBOX_VERIFY_FROM);
        if (!from || (shared && !sharedSms)) {
          throw new VerifyError(
            "shared_sender_unavailable",
            "None of coss.com's shared numbers can send to this destination.",
          );
        }
        const { sms } = await opts.sms.send({
          environment: shared && sharedSms ? sharedSms.environment : env,
          // Shared numbers' messages are coss.com's own: the customer pays through `verify.sms`.
          apiKeyId: shared ? null : source.apiKeyId,
          apiKeyOwnerId: shared ? null : source.apiKeyOwnerId,
          params: { from, to: row.to, body: verifySmsText(settings.appName, code) },
          idempotencyKey,
          // Sandbox messages keep their text: nothing is delivered, and the developer reads it.
          discardBody: !sandbox,
        });
        if (sms.status === "failed") {
          const suppressed = sms.failure?.code === "suppressed";
          if (!recovering) {
            await failSend(
              row,
              sandbox,
              suppressed ? "recipient_suppressed" : "send_failed",
              sendNumber,
            );
          }
          throw new VerifyError(
            suppressed ? "recipient_suppressed" : "send_failed",
            suppressed
              ? "The number opted out of texts (STOP) or is suppressed."
              : `The code couldn't be sent: ${sms.failure?.message ?? "the SMS failed"}.`,
            { verificationId: row.id },
          );
        }
        sent = { smsId: sms.id, route };
      } else {
        if (!opts.sendEmail) {
          throw new VerifyError("send_failed", "Email codes aren't available.");
        }
        const content = verifyEmailContent(settings.appName, code, settings.ttlSeconds, {
          ownSender: Boolean(settings.emailFrom),
        });
        const email = await opts.sendEmail({
          environment: env,
          apiKeyId: source.apiKeyId,
          apiKeyOwnerId: source.apiKeyOwnerId,
          from: settings.emailFrom,
          appName: settings.appName,
          to: row.to,
          ...content,
          idempotencyKey,
        });
        if (email.suppressed || !email.emailId) {
          if (!recovering) await failSend(row, sandbox, "recipient_suppressed", sendNumber);
          throw new VerifyError(
            "recipient_suppressed",
            "The address is on the environment's suppression list.",
            { verificationId: row.id },
          );
        }
        sent = { emailId: email.emailId, route: email.route };
      }
    } catch (error) {
      if (!recovering && !(error instanceof VerifyError && error.verificationId)) {
        await failSend(row, sandbox, "send_failed", sendNumber);
      }
      throw error;
    }
    await db.transaction(async (tx) => {
      await tx
        .update(verifySend)
        .set({ route: sent.route, smsId: sent.smsId ?? null, emailId: sent.emailId ?? null })
        .where(
          and(
            eq(verifySend.requestId, row.id),
            eq(verifySend.organizationId, row.organizationId),
            eq(verifySend.sequence, sendNumber),
          ),
        );
      await recordVerifyEvent(tx, row, "sent", { sandbox, detail: sent.route.replace("_", " ") });
    });
  }

  /**
   * Claims send number `sequence` of `row` (in the transaction that set the code it carries):
   * `false` when another request already holds this Idempotency-Key.
   */
  async function claimSend(
    tx: Transaction,
    env: VerifyEnvironment,
    row: VerifyRequestRow,
    sequence: number,
    route: Route,
    source: SpendSource,
    key: { idempotencyKey: string | null; requestHash: string | null },
  ): Promise<boolean> {
    const [claimed] = await tx
      .insert(verifySend)
      .values({
        organizationId: row.organizationId,
        environmentId: row.environmentId,
        requestId: row.id,
        sequence,
        channel: row.channel,
        route,
        country: row.toCountry,
        messageEnvironmentId: messageEnvironmentFor(env, row.channel, route),
        // Whoever asked for this send pays for it (a resend can come from another key).
        apiKeyId: source.apiKeyId,
        apiKeyOwnerId: source.apiKeyOwnerId,
        ...key,
      })
      .onConflictDoNothing()
      .returning({ id: verifySend.id });
    return claimed !== undefined;
  }

  /** Live shared-number SMS: `verify.sms` by country (the organization's price and caps). */
  async function reserveSharedSms(
    tx: Transaction,
    env: VerifyEnvironment,
    destination: Destination,
    route: Route,
    settings: ResolvedVerifySettings,
  ) {
    if (env.mode !== "live" || route !== "shared_number" || destination.channel !== "sms") return;
    if (!opts.billing) return;
    await opts.billing.reserve(tx, {
      organizationId: env.organizationId,
      meter: "verify.sms",
      quantity: countSegments(verifySmsText(settings.appName, "0".repeat(settings.codeLength)))
        .segments,
      dimension: dimensionKey({ country: destination.country }),
    });
  }

  type KeyedRequest = {
    row: VerifyRequestRow;
    requestHash: string | null;
    /** The send the key claimed: 1 for the request's own key, else its resend's. */
    sequence: number;
  };

  /**
   * The verification an Idempotency-Key already started (the request's own key) or resent (a send's
   * key), with that request's hash and the send it claimed.
   */
  async function sameKeyRow(
    executor: Executor,
    env: VerifyEnvironment,
    key: string,
  ): Promise<KeyedRequest | undefined> {
    const inEnvironment = and(
      eq(verifyRequest.organizationId, env.organizationId),
      eq(verifyRequest.environmentId, env.environmentId),
    );
    const [started] = await executor
      .select()
      .from(verifyRequest)
      .where(and(inEnvironment, eq(verifyRequest.idempotencyKey, key)))
      .limit(1);
    if (started) return { row: started, requestHash: started.requestHash, sequence: 1 };
    const [resent] = await executor
      .select({
        row: verifyRequest,
        requestHash: verifySend.requestHash,
        sequence: verifySend.sequence,
      })
      .from(verifySend)
      .innerJoin(
        verifyRequest,
        and(
          eq(verifyRequest.id, verifySend.requestId),
          eq(verifyRequest.organizationId, verifySend.organizationId),
        ),
      )
      .where(
        and(
          inEnvironment,
          eq(verifySend.environmentId, env.environmentId),
          eq(verifySend.idempotencyKey, key),
        ),
      )
      .limit(1);
    return resent;
  }

  /**
   * A retry of a request already answered: the same answer (a blocked one is refused again). If
   * its send never got a message (the process stopped right after claiming it) and is still the
   * latest, it goes now, with the same code.
   */
  async function replayOf(
    input: StartVerificationInput,
    found: KeyedRequest,
    hash: string | null,
  ): Promise<{ verification: VerificationObjectOutput; replayed: boolean }> {
    const { row } = found;
    const sandbox = input.environment.mode === "sandbox";
    if (found.requestHash !== hash) {
      throw new VerifyError(
        "idempotency_key_reused",
        "This idempotency key was already used with a different request body.",
      );
    }
    if (row.status === "blocked") throw blockedError(row);
    if (row.status === "pending" && row.expiresAt > new Date() && row.sends === found.sequence) {
      const [send] = await db
        .select()
        .from(verifySend)
        .where(
          and(
            eq(verifySend.requestId, row.id),
            eq(verifySend.organizationId, row.organizationId),
            eq(verifySend.sequence, found.sequence),
          ),
        )
        .limit(1);
      if (
        send &&
        !send.smsId &&
        !send.emailId &&
        send.createdAt.getTime() < Date.now() - RECOVER_SEND_AFTER_MS
      ) {
        // The send may have gone out with its id lost (the process stopped before saving it): its
        // key finds the message, sent with the settings of the time (they may have changed).
        const sent = send.messageEnvironmentId
          ? await smsByKey(send.messageEnvironmentId, `${row.id}:send:${found.sequence}`)
          : undefined;
        if (sent) {
          await db
            .update(verifySend)
            .set({ smsId: sent.id })
            .where(
              and(eq(verifySend.id, send.id), eq(verifySend.organizationId, send.organizationId)),
            );
          return { verification: await current(row, sandbox), replayed: true };
        }
        // The send is still the spend of whoever asked for it (a retry can come with another key),
        // and their holds count now: a recovered send is new spend.
        const source = { apiKeyId: send.apiKeyId, apiKeyOwnerId: send.apiKeyOwnerId };
        if (!sandbox) await assertCanSpend(input.environment, source);
        const settings = await getVerifySettings(input.environment);
        if (settings) {
          await deliver(input.environment, source, row, send.route, settings, found.sequence, true);
        }
      }
    }
    return { verification: await current(row, sandbox), replayed: true };
  }

  /**
   * Refuses a live send while the organization is suspended for its sending reputation, on a
   * billing hold, or the source's budget is spent.
   */
  async function assertCanSpend(env: VerifyEnvironment, source: SpendSource): Promise<void> {
    if (await isSuspended(env.organizationId)) {
      throw new VerifyError(
        "account_suspended",
        "Live sending is suspended for this organization because of its sending reputation.",
      );
    }
    if (await isOnBillingHold(env.organizationId)) {
      throw new VerifyError(
        "billing_hold",
        "Live sending is paused: your organization has an overdue invoice or reached its spend limit.",
      );
    }
    const held = await budgetHoldFor({
      organizationId: env.organizationId,
      projectId: env.projectId,
      apiKeyId: source.apiKeyId,
      userId: source.apiKeyOwnerId,
    });
    if (held) throw new VerifyError("budget_exceeded", BUDGET_EXCEEDED_MESSAGES[held]);
  }

  function blockedError(row: VerifyRequestRow): VerifyError {
    return new VerifyError(
      "verification_blocked",
      `The fraud guard blocked this verification (${row.riskReasons
        .map((reason) => reason.code)
        .join(", ")}); nothing was sent.`,
      { verificationId: row.id },
    );
  }

  async function start(
    input: StartVerificationInput,
  ): Promise<{ verification: VerificationObjectOutput; replayed: boolean }> {
    const { environment: env, params } = input;
    const sandbox = env.mode === "sandbox";
    const idempotencyKey = input.idempotencyKey || null;
    const requestHash = idempotencyKey ? hashRequest(params) : null;

    if (idempotencyKey) {
      const existing = await sameKeyRow(db, env, idempotencyKey);
      if (existing) return replayOf(input, existing, requestHash);
    }

    const settings = await getVerifySettings(env);
    if (!settings) throw new VerifyError("not_found", "Environment not found.");
    const { destination, route } = destinationOf(env, params, settings);
    if (!sandbox && destination.channel === "sms" && (await isHipaaMode(env.organizationId))) {
      if (route === "shared_number") {
        throw new HipaaModeError(
          "HIPAA mode needs your own number for SMS codes: set an SMS sender in Verify's settings.",
        );
      }
      if (!HIPAA_SMS_COUNTRIES.includes(destination.country)) {
        throw new HipaaModeError(
          `HIPAA mode only sends SMS to ${HIPAA_SMS_COUNTRIES.join(", ")} numbers, which is what the BAA with Twilio covers.`,
        );
      }
    }

    // A pending verification to the same destination is sent again, with a new code.
    const pending = await pendingFor(db, env, destination);
    if (pending && pending.sends >= MAX_SENDS) throw tooManySends(pending);
    // Every live send is the customer's spend, whichever environment it goes out from (coss.com's
    // senders don't check the customer's holds).
    if (!sandbox) await assertCanSpend(env, sourceOf(input));

    const riskInput = {
      destination: riskDestination(destination),
      ip: params.ip ?? null,
      userId: params.user_id ?? null,
      shared: !sandbox && route === "shared_number",
    };
    const refundDestination = await consume(
      verifyDestinationQuota(env, destination.to),
      "Too many codes were sent to this destination; try again in a few minutes.",
    );
    const refunds = [refundDestination];
    // What the fraud guard counted for this start (taken back unless it makes a verification).
    let counted: VerificationRisk | null = null;
    let claim:
      | { kind: "send"; row: VerifyRequestRow; sequence: number }
      | { kind: "replay"; found: KeyedRequest }
      | { kind: "blocked"; row: VerifyRequestRow };
    try {
      if (!sandbox && route === "shared_number") {
        refunds.push(
          await consume(
            verifySharedSmsQuota(env),
            "Your organization reached its daily limit of codes from coss.com's shared numbers.",
          ),
        );
      }
      // Only a new verification passes the fraud guard (and counts in it, in the same step):
      // a resend's was checked when it started.
      const risk = pending ? null : await checkVerificationRisk(opts.risk, env, riskInput);
      counted = risk;
      claim = await db.transaction(async (tx) => {
        // One request per Idempotency-Key at a time, whatever its destination (the key is looked
        // for in two tables), then one start per destination: concurrent first starts make one
        // verification, and concurrent resends each claim a send of their own. Always in this
        // order, so two requests never wait on each other's locks.
        if (idempotencyKey) {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`verify-key:${env.environmentId}:${idempotencyKey}`}, 0))`,
          );
        }
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`verify:${env.environmentId}:${destination.channel}:${destination.to}`}, 0))`,
        );
        if (idempotencyKey) {
          const existing = await sameKeyRow(tx, env, idempotencyKey);
          if (existing) return { kind: "replay" as const, found: existing };
        }
        const latest = await pendingFor(tx, env, destination);
        if (latest) {
          if (latest.sends >= MAX_SENDS) throw tooManySends(latest);
          const sequence = latest.sends + 1;
          const code = deriveCode(opts.codeKey, latest.id, sequence, latest.codeLength, sandbox);
          const [claimed] = await tx
            .update(verifyRequest)
            .set({
              sends: sequence,
              codeHash: hashCode(opts.codeKey, latest.id, code),
              expiresAt: new Date(Date.now() + settings.ttlSeconds * 1000),
            })
            .where(
              and(
                eq(verifyRequest.id, latest.id),
                eq(verifyRequest.organizationId, latest.organizationId),
                // Checks don't take the lock: one may have just approved or failed it.
                eq(verifyRequest.status, "pending"),
                eq(verifyRequest.sends, latest.sends),
              ),
            )
            .returning();
          if (!claimed) throw new PendingChanged();
          if (
            !(await claimSend(tx, env, claimed, sequence, route, sourceOf(input), {
              idempotencyKey,
              requestHash,
            }))
          ) {
            throw new KeyTaken();
          }
          await reserveSharedSms(tx, env, destination, route, settings);
          return { kind: "send" as const, row: claimed, sequence };
        }
        // The pending verification seen before ended in between: start again, with the guard.
        if (!risk) throw new PendingChanged();
        const id = newId(ID_PREFIXES.verifyRequest);
        const blocked = risk.decision === "block";
        const code = deriveCode(opts.codeKey, id, 1, settings.codeLength, sandbox);
        const [inserted] = await tx
          .insert(verifyRequest)
          .values({
            id,
            organizationId: env.organizationId,
            projectId: env.projectId,
            environmentId: env.environmentId,
            apiKeyId: input.apiKeyId,
            apiKeyOwnerId: input.apiKeyOwnerId ?? null,
            channel: destination.channel,
            to: destination.to,
            toCountry: destination.country,
            status: blocked ? "blocked" : "pending",
            sends: blocked ? 0 : 1,
            riskReasons: risk.reasons,
            codeHash: blocked ? null : hashCode(opts.codeKey, id, code),
            codeLength: settings.codeLength,
            maxAttempts: settings.maxAttempts,
            expiresAt: new Date(Date.now() + settings.ttlSeconds * 1000),
            tags: params.tags ?? [],
            idempotencyKey,
            requestHash,
          })
          .onConflictDoNothing({
            target: [verifyRequest.environmentId, verifyRequest.idempotencyKey],
          })
          .returning();
        // The same key, for another destination, at the same moment.
        if (!inserted) throw new KeyTaken();
        await recordVerifyEvent(tx, inserted, blocked ? "blocked" : "started", { sandbox });
        if (blocked) return { kind: "blocked" as const, row: inserted };
        await claimSend(tx, env, inserted, 1, route, sourceOf(input), {
          idempotencyKey: null,
          requestHash: null,
        });
        if (env.mode === "live" && opts.billing) {
          // The plan must have room for one more approval, but nothing is held for it: only an
          // approval uses the unit (most verifications are never approved: pumping, typos).
          const unit = {
            organizationId: env.organizationId,
            meter: "verify.verifications" as const,
            quantity: 1,
          };
          if (opts.billing.release) {
            await opts.billing.reserve(tx, unit);
            await opts.billing.release(tx, unit);
          }
          await reserveSharedSms(tx, env, destination, route, settings);
        }
        return { kind: "send" as const, row: inserted, sequence: 1 };
      });
    } catch (error) {
      // Nothing went out, so the quotas aren't spent, and no verification was made.
      for (const refund of refunds) await refund();
      if (counted) await uncountVerificationStart(opts.risk, counted);
      if (error instanceof PendingChanged) return start(input);
      if (error instanceof KeyTaken && idempotencyKey) {
        const existing = await sameKeyRow(db, env, idempotencyKey);
        if (existing) return replayOf(input, existing, requestHash);
        throw new VerifyError(
          "request_in_progress",
          "This idempotency key is busy. Retry shortly.",
        );
      }
      throw error;
    }

    // A replay, or a resend of a verification another start made meanwhile: not a new one.
    if (counted && (claim.kind === "replay" || (claim.kind === "send" && claim.sequence > 1))) {
      await uncountVerificationStart(opts.risk, counted);
    }
    if (claim.kind === "replay") {
      for (const refund of refunds) await refund();
      return replayOf(input, claim.found, requestHash);
    }
    // Blocked requests count against the quotas: an attack shouldn't get its tries back.
    if (claim.kind === "blocked") throw blockedError(claim.row);
    try {
      await deliver(env, sourceOf(input), claim.row, route, settings, claim.sequence);
    } catch (error) {
      for (const refund of refunds) await refund();
      throw error;
    }
    return { verification: await current(claim.row, sandbox), replayed: false };
  }

  async function findForCheck(
    env: VerifyEnvironment,
    params: CheckVerificationRequestOutput,
  ): Promise<VerifyRequestRow> {
    const scope = and(
      eq(verifyRequest.organizationId, env.organizationId),
      eq(verifyRequest.environmentId, env.environmentId),
    );
    if (params.verification_id !== undefined) {
      const [row] = isId("vrf", params.verification_id)
        ? await db
            .select()
            .from(verifyRequest)
            .where(and(scope, eq(verifyRequest.id, params.verification_id)))
            .limit(1)
        : [];
      if (!row) {
        throw new VerifyError("not_found", "Verification not found.", { param: "verification_id" });
      }
      return row;
    }
    const [row] = await db
      .select()
      .from(verifyRequest)
      .where(and(scope, eq(verifyRequest.to, params.to ?? "")))
      .orderBy(desc(verifyRequest.createdAt), desc(verifyRequest.id))
      .limit(1);
    if (!row)
      throw new VerifyError("not_found", "No verification for this destination.", { param: "to" });
    return row;
  }

  async function check(input: CheckVerificationInput): Promise<VerificationCheckOutput> {
    const { environment: env, params } = input;
    const sandbox = env.mode === "sandbox";
    const idempotencyKey = input.idempotencyKey || null;
    const found = await findForCheck(env, params);
    await consume(
      verifyCheckQuota(env, found.to),
      "Too many codes were checked for this destination; try again later.",
    );

    const outcome = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(verifyRequest)
        .where(
          and(
            eq(verifyRequest.id, found.id),
            eq(verifyRequest.organizationId, found.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!row) throw new VerifyError("not_found", "Verification not found.");
      // A retried check (same Idempotency-Key) gets the same answer without spending an attempt,
      // whatever was checked in between.
      if (idempotencyKey) {
        const [previous] = await tx
          .select({ valid: verifyCheck.valid })
          .from(verifyCheck)
          .where(
            and(
              eq(verifyCheck.requestId, row.id),
              eq(verifyCheck.organizationId, row.organizationId),
              eq(verifyCheck.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        if (previous) return { row, valid: previous.valid, approvedNow: false };
      }
      const decided = await decide(tx, row);
      if (idempotencyKey) {
        await tx.insert(verifyCheck).values({
          organizationId: row.organizationId,
          requestId: row.id,
          idempotencyKey,
          valid: decided.valid,
        });
      }
      return decided;
    });

    async function decide(
      tx: Transaction,
      row: VerifyRequestRow,
    ): Promise<{ row: VerifyRequestRow; valid: boolean; approvedNow: boolean }> {
      const now = new Date();
      const where = and(
        eq(verifyRequest.id, row.id),
        eq(verifyRequest.organizationId, row.organizationId),
      );
      if (row.status === "pending" && row.expiresAt <= now) {
        const [expired] = await tx
          .update(verifyRequest)
          .set({ status: "expired", codeHash: null })
          .where(where)
          .returning();
        return { row: expired ?? row, valid: false, approvedNow: false };
      }
      const matches = codeMatches(opts.codeKey, row.id, params.code, row.codeHash);
      if (row.status === "approved") {
        // The same code again, while it would still be valid: idempotent; nothing is billed again.
        return { row, valid: matches && row.expiresAt > now, approvedNow: false };
      }
      if (row.status !== "pending") return { row, valid: false, approvedNow: false };
      if (matches) {
        const [approved] = await tx
          .update(verifyRequest)
          .set({
            status: "approved",
            approvedAt: now,
            usageRecordedAt: env.mode === "live" ? now : null,
          })
          .where(and(where, eq(verifyRequest.status, "pending"), isNull(verifyRequest.approvedAt)))
          .returning();
        if (!approved) return { row, valid: false, approvedNow: false };
        if (env.mode === "live") {
          // The approval is what uses a unit of a capped plan.
          await opts.billing?.reserve(tx, {
            organizationId: approved.organizationId,
            meter: "verify.verifications",
            quantity: 1,
          });
          await recordUsage(tx, {
            organizationId: approved.organizationId,
            environmentId: approved.environmentId,
            projectId: approved.projectId,
            apiKeyId: approved.apiKeyId,
            userId: approved.apiKeyOwnerId,
            meter: "verify.verifications",
            quantity: 1,
          });
        }
        await recordVerifyEvent(tx, approved, "approved", { sandbox, occurredAt: now });
        return { row: approved, valid: true, approvedNow: true };
      }
      const attempts = row.attempts + 1;
      const exhausted = attempts >= row.maxAttempts;
      const [updated] = await tx
        .update(verifyRequest)
        .set({
          attempts,
          ...(exhausted
            ? { status: "failed" as const, failureCode: "max_attempts", codeHash: null }
            : {}),
        })
        .where(where)
        .returning();
      if (updated) {
        await recordVerifyEvent(tx, updated, exhausted ? "failed" : "check_failed", { sandbox });
      }
      return { row: updated ?? row, valid: false, approvedNow: false };
    }

    if (outcome.approvedNow && outcome.row.channel === "sms" && outcome.row.toCountry) {
      await recordVerificationApproval(opts.risk, env, {
        channel: "sms",
        phoneNumber: outcome.row.to,
        country: outcome.row.toCountry,
        lineType: "mobile",
      });
    }
    return {
      object: "verification_check",
      valid: outcome.valid,
      verification: await verificationObject(outcome.row, sandbox),
    };
  }

  async function cancel(input: {
    environment: VerifyEnvironment;
    verificationId: string;
  }): Promise<VerificationObjectOutput> {
    const env = input.environment;
    const sandbox = env.mode === "sandbox";
    const row = await findForCheck(env, { verification_id: input.verificationId, code: "" });
    if (row.status === "canceled") return verificationObject(row, sandbox);
    const canceled = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(verifyRequest)
        .set({ status: "canceled", codeHash: null })
        .where(
          and(
            eq(verifyRequest.id, row.id),
            eq(verifyRequest.organizationId, row.organizationId),
            eq(verifyRequest.status, "pending"),
            gt(verifyRequest.expiresAt, new Date()),
          ),
        )
        .returning();
      if (updated) await recordVerifyEvent(tx, updated, "canceled", { sandbox });
      return updated;
    });
    if (!canceled) {
      throw new VerifyError(
        "verification_not_cancelable",
        "Only pending verifications can be canceled.",
      );
    }
    return verificationObject(canceled, sandbox);
  }

  return { start, check, cancel };
}
