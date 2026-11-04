import { randomUUID } from "node:crypto";
import type { UsageGate } from "@coss/billing/gate";
import { billingHoldExists, budgetHoldExists } from "@coss/billing/metering";
import { hipaaModeSql } from "@coss/compliance";
import { db, schema, type Transaction } from "@coss/db";
import { isId } from "@coss/db/id";
import {
  IDEMPOTENCY_KEY_TTL_MS,
  type IdempotencyErrors,
  isReplayOf,
  withIdempotencyKey,
} from "@coss/db/idempotency";
import { withoutTrailingSlashes } from "@coss/db/url";
import { isMarketingPaused } from "@coss/reputation";
import type { ScreenInput, ScreenOutcome } from "@coss/screening";
import { and, asc, eq, inArray, isNull, lt, lte, not, notExists, or, sql } from "drizzle-orm";
import {
  insertAttachments,
  loadOutboundAttachments,
  prepareAttachments,
  purgeSendContent,
} from "./attachments.ts";
import { broadcastContentCache, withRenderedBody } from "./broadcast-content.ts";
import { bumpBroadcastStat } from "./broadcast-stats.ts";
import { assertWithinBudget } from "./budgets.ts";
import { dedicatedPoolSql } from "./dedicated-ips.ts";
import type { EmailDispatchQueue } from "./dispatch.ts";
import { authorizeLiveSender, marketingPausedError, subaccountTenantSql } from "./domains.ts";
import { EmailError } from "./errors.ts";
import { COSS_EVENT_SOURCE, recordProviderEvent } from "./events.ts";
import { htmlToText } from "./html-text.ts";
import { type LinkKeyRing, preferenceLinks } from "./link-tokens.ts";
import { applyMarketingFooter } from "./marketing-footer.ts";
import { getMarketingSettingsRow } from "./marketing-settings.ts";
import {
  type EmailProvider,
  type EmailStream,
  type OutboundAttachment,
  type OutboundEmail,
  type ProviderEvent,
  ThrottledSendError,
  UncertainSendError,
} from "./provider.ts";
import {
  type EmailRow,
  PROVIDER_ERROR_MESSAGE,
  selectEmailsWithMode,
  toEmailBatchObject,
  toEmailObjects,
} from "./read.ts";
import { canonicalJson, hashSendBatchRequest, hashSendRequest } from "./request-hash.ts";
import {
  type EmailBatchObjectOutput,
  type EmailObjectOutput,
  LIST_UNSUBSCRIBE_HEADERS,
  MAX_HEADERS_WITH_UNSUBSCRIBE,
  parseEmailAddress,
  type SendEmailRequestOutput,
  uniqueRecipientCount,
} from "./schemas.ts";
import {
  imageDominantEmail,
  loadEmailScreeningContent,
  recordScreeningDomainBlock,
} from "./screening.ts";
import type { ScreeningImageLoader } from "./screening-images.ts";
import { type Skip, skippedRecipients } from "./send-eligibility.ts";
import { resolveStoreContent } from "./storage-settings.ts";
import { pauseSubaccount } from "./subaccount-reputation.ts";
import { assertSubaccountStillSends, sendingSubaccount } from "./subaccounts.ts";
import { renderTemplateForSend, type TemplateVersionCache } from "./templates.ts";
import { topicsByKey } from "./topics.ts";
import { newTrackingToken } from "./tracking.ts";
import { trackingBaseUrlFor } from "./tracking-domains.ts";
import { instrumentHtml, unsubscribeUrl } from "./tracking-html.ts";
import { type ResolvedTracking, resolveTracking } from "./tracking-settings.ts";
import { billableRecipientsSql, freezeBillableRecipients, recordEmailUsage } from "./usage.ts";

/** The authenticated environment a send happens in (from `authenticateApiKey`). */
export type SendEnvironment = {
  organizationId: string;
  projectId: string;
  environmentId: string;
  mode: "live" | "sandbox";
};

export type SendEmailInput = {
  environment: SendEnvironment;
  apiKeyId: string | null;
  /** The member a personal key belongs to (its usage is their spend); `null`: none. */
  apiKeyOwnerId?: string | null;
  params: SendEmailRequestOutput;
  idempotencyKey?: string | null;
  /**
   * The request's W3C `traceparent` (`parseTraceparent`), stored on the email and echoed in its
   * log lines and webhooks. Not part of the request hash: a retry may carry another one.
   */
  traceparent?: string | null;
  /** Internal callers only: use the same retention on every retry; Infinity never expires. */
  idempotencyRetentionMs?: number;
  /**
   * Internal callers only: the body holds a secret (a sign-in link), so it is cleared once the
   * email is sent, failed or canceled. Its history keeps everything else.
   */
  discardBody?: boolean;
  /**
   * Internal callers only, never reachable from the public API or SMTP: skips per-email content
   * screening. For fixed templates whose variable text was screened when it was set up (Scheduling's
   * booking emails, which name a patient and a doctor: sampling would send them to the AI Gateway).
   */
  screeningExempt?: boolean;
  /**
   * Internal callers only: a message in coss.com's own environment on behalf of an organization in
   * HIPAA mode. It gets that mode's rules: no screening, no stored content, required TLS, hidden
   * from staff.
   */
  hipaaOrigin?: boolean;
  /**
   * Internal callers only (the dashboard's test sends): render the template's draft, refused
   * (`template_revision_mismatch`) unless it is still at the revision the caller checked.
   */
  templateDraft?: { revision: number };
  /**
   * Internal callers only (inboxes): runs in the transaction that stores the email, only when this
   * request stored it (never for a replay).
   */
  afterInsert?: (tx: Transaction, row: EmailRow) => Promise<void>;
  /**
   * Internal callers only (inboxes): the fingerprint an `idempotencyKey` is checked against,
   * instead of `params`' (theirs hold values derived at send time, which a retry may not repeat).
   */
  requestHash?: string;
};

export type SendEmailBatchInput = {
  environment: SendEnvironment;
  apiKeyId: string | null;
  /** The member a personal key belongs to (its usage is their spend); `null`: none. */
  apiKeyOwnerId?: string | null;
  emails: SendEmailRequestOutput[];
  idempotencyKey?: string | null;
  /** The request's W3C `traceparent`, stored on every email of the batch. */
  traceparent?: string | null;
};

export type EmailService = {
  /** Read a matching replay without creating or dispatching an email. */
  replay(input: SendEmailInput): Promise<EmailObjectOutput | null>;
  /** Stores the email; immediate sends enqueue a job, future sends wait as `scheduled`. */
  send(input: SendEmailInput): Promise<{ email: EmailObjectOutput; replayed: boolean }>;
  /** Read a matching batch replay without creating or dispatching anything. */
  replayBatch(input: SendEmailBatchInput): Promise<EmailBatchObjectOutput | null>;
  /**
   * Stores every email of the batch, as `send` would, in one transaction: all of them or none.
   * One idempotency key covers the whole batch.
   */
  sendBatch(
    input: SendEmailBatchInput,
  ): Promise<{ batch: EmailBatchObjectOutput; replayed: boolean }>;
  /** Hands a queued email to its provider (the worker's dispatch job). Safe to run twice. */
  /** `stream` (the job's queue) is informational: the email row decides. */
  dispatch(input: {
    organizationId: string;
    emailId: string;
    stream?: EmailStream;
  }): Promise<EmailObjectOutput>;
  /** Cancels a scheduled email; an already canceled one is returned as is. */
  cancel(input: {
    organizationId: string;
    environmentId: string;
    emailId: string;
  }): Promise<EmailObjectOutput>;
  /**
   * The `Message-ID` an email got from the provider that accepted it (replies reference it);
   * `null` before that, or when the provider doesn't say.
   */
  messageIdOf?(email: { provider: string | null; providerMessageId: string | null }): string | null;
  /** Moves a scheduled email to a new time (`scheduled_at`, already validated). */
  reschedule(input: {
    organizationId: string;
    environmentId: string;
    emailId: string;
    scheduledAt: string;
  }): Promise<EmailObjectOutput>;
  /**
   * System-level (worker): sends scheduled emails whose time has come, across organizations.
   * Returns how many due emails it looked at.
   */
  dispatchDue(opts?: DispatchDueOptions): Promise<number>;
};

export type DispatchDueOptions = {
  now?: Date;
  limit?: number;
  signal?: AbortSignal;
  scope?: { organizationIds: string[] };
};

const DISPATCH_DUE_LIMIT = 50;
// At most five attachment payloads (up to 25 MB each) in memory at once.
const DISPATCH_DUE_CONCURRENCY = 5;

export { IDEMPOTENCY_KEY_TTL_MS };

const IDEMPOTENCY_ERRORS: IdempotencyErrors = {
  inProgress: () =>
    new EmailError("request_in_progress", "This idempotency key is busy. Retry shortly."),
  reused: () =>
    new EmailError(
      "idempotency_key_reused",
      "This idempotency key was already used with a different request body.",
    ),
};
const ERROR_MESSAGE_MAX_LENGTH = 1000;

const {
  broadcast,
  contact,
  email,
  emailBatch,
  emailLink,
  emailRecipient,
  environment,
  organizationDeletion,
  organizationSuspension,
} = schema;

/**
 * Scheduled sends wait while the organization is suspended or on a billing hold, and never go
 * once it is being deleted.
 */
function organizationActive() {
  return and(
    not(billingHoldExists(email.organizationId)),
    notExists(
      db
        .select({ id: organizationSuspension.organizationId })
        .from(organizationSuspension)
        .where(eq(organizationSuspension.organizationId, email.organizationId)),
    ),
    notExists(
      db
        .select({ id: organizationDeletion.id })
        .from(organizationDeletion)
        .where(
          and(
            eq(organizationDeletion.organizationId, email.organizationId),
            eq(organizationDeletion.status, "pending"),
          ),
        ),
    ),
  );
}

/** Live scheduled sends also wait while a budget of their project, key or member is used up. */
function withinBudget() {
  return not(
    budgetHoldExists({
      organizationId: email.organizationId,
      projectId: email.projectId,
      apiKeyId: email.apiKeyId,
      userId: email.apiKeyOwnerId,
    }),
  );
}

function bareAddress(value: string): string {
  return parseEmailAddress(value).address.toLowerCase();
}

/**
 * The message for the provider, without the recipients coss.com suppressed. An email with only HTML
 * gets a plain-text part generated from it (never stored: the email keeps what was sent to coss.com).
 */
/**
 * What a dispatch claim decides about how a live email goes out: through its sub-account's own
 * tenant (its domain; never with the organization's dedicated IP pool, whose configuration set
 * that tenant can't use), else through the organization's tenant like the organization's own
 * mail (a domain it shares included), with its dedicated IP pool when it has one.
 */
function claimRouting(row: EmailRow, provider: string, sandbox: boolean) {
  if (sandbox) return { dedicatedPool: false, subaccountTenant: false, requireTls: false };
  const pool = dedicatedPoolSql(row.organizationId, provider, row.stream);
  // Decided here, not only at acceptance: the mode may have been turned on while this waited, or
  // between this send resolving its settings and storing the row.
  const hipaa = sql<boolean>`(${email.hipaaOrigin} or ${hipaaModeSql(row.organizationId)})`;
  const subaccountTenant = subaccountTenantSql({
    organizationId: row.organizationId,
    subaccountId: row.subaccountId,
    from: row.from,
    provider,
  });
  return {
    dedicatedPool:
      subaccountTenant === false ? pool : sql<boolean>`(not (${subaccountTenant}) and ${pool})`,
    subaccountTenant,
    requireTls: hipaa,
    storeContent: sql<boolean>`(${email.storeContent} and not ${hipaa})`,
    trackOpens: sql<boolean>`(${email.trackOpens} and not ${hipaa})`,
    trackClicks: sql<boolean>`(${email.trackClicks} and not ${hipaa})`,
  };
}

function toOutbound(
  row: EmailRow,
  suppressed: ReadonlySet<string>,
  attachments: OutboundAttachment[],
): OutboundEmail {
  const keep = (list: string[]) => list.filter((value) => !suppressed.has(bareAddress(value)));
  return {
    emailId: row.id,
    organizationId: row.organizationId,
    stream: row.stream,
    from: row.from,
    to: keep(row.to),
    cc: keep(row.cc),
    bcc: keep(row.bcc),
    replyTo: row.replyTo,
    subject: row.subject,
    html: row.html,
    text: row.text ?? (row.html === null ? null : htmlToText(row.html)),
    headers: row.headers,
    tags: row.tags,
    attachments,
    dedicatedPool: row.dedicatedPool,
    requireTls: row.requireTls,
    tenantSubaccountId: row.subaccountTenant ? row.subaccountId : null,
  };
}

/**
 * One recipient row per distinct address; an address listed twice keeps its first kind (to → cc →
 * bcc). Rows start `queued`.
 */
function recipientRows(row: EmailRow): (typeof emailRecipient.$inferInsert)[] {
  const seen = new Set<string>();
  const rows: (typeof emailRecipient.$inferInsert)[] = [];
  for (const [kind, list] of [
    ["to", row.to],
    ["cc", row.cc],
    ["bcc", row.bcc],
  ] as const) {
    for (const value of list) {
      const address = bareAddress(value);
      if (seen.has(address)) continue;
      seen.add(address);
      rows.push({
        organizationId: row.organizationId,
        emailId: row.id,
        address,
        kind,
        position: rows.length,
      });
    }
  }
  return rows;
}

/** A whole-message event coss.com itself records about an email. */
function cossEvent(
  row: EmailRow,
  event: Pick<ProviderEvent, "type" | "providerEventType" | "sourceId" | "data">,
): ProviderEvent {
  return {
    ...event,
    provider: COSS_EVENT_SOURCE,
    emailId: row.id,
    providerMessageId: null,
    recipients: null,
    occurredAt: new Date(),
  };
}

/** The event coss.com records when the provider rejects a send. */
function failedEvent(
  row: EmailRow,
  provider: string,
  failure = { code: "provider_error", message: PROVIDER_ERROR_MESSAGE },
): ProviderEvent {
  return cossEvent(row, {
    type: "email.failed",
    providerEventType: "ProviderError",
    sourceId: provider,
    data: { failure },
  });
}

/** The event coss.com records for a recipient it skipped because of a suppression list entry. */
function suppressedEvent(row: EmailRow, address: string, skip: Skip): ProviderEvent {
  return {
    provider: COSS_EVENT_SOURCE,
    providerEventType: "Suppressed",
    emailId: row.id,
    providerMessageId: null,
    type: "email.suppressed",
    recipients: [address],
    occurredAt: new Date(),
    sourceId:
      skip.kind === "suppressed" ? skip.entry.id : `unsubscribed:${skip.contactId ?? address}`,
    data:
      skip.kind === "suppressed"
        ? {
            suppression: {
              id: skip.entry.id,
              scope: skip.entry.scope,
              reason: skip.entry.reason,
            },
          }
        : { unsubscribe: { contact_id: skip.contactId, topic: skip.topic } },
  };
}

/** Recipients of an email that a suppression entry made coss.com skip. */
async function suppressedAddresses(row: EmailRow): Promise<Set<string>> {
  const rows = await db
    .select({ address: emailRecipient.address })
    .from(emailRecipient)
    .where(
      and(
        eq(emailRecipient.organizationId, row.organizationId),
        eq(emailRecipient.emailId, row.id),
        eq(emailRecipient.status, "suppressed"),
      ),
    );
  return new Set(rows.map((recipient) => recipient.address));
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, ERROR_MESSAGE_MAX_LENGTH) || "Unknown provider error.";
}

export type EmailServiceOptions = {
  liveProvider: EmailProvider;
  sandboxProvider: EmailProvider;
  queue: EmailDispatchQueue;
  /**
   * Public origin of the API's `/t/*` tracking routes (no trailing slash). Without it, sends that
   * resolve to open or click tracking fail.
   */
  trackingBaseUrl?: string;
  /**
   * The provider serving custom tracking domains (`DomainDeps.tracking.name`). With it, an email
   * whose From domain has an `active` tracking domain of that provider is tracked through it
   * (`https://<hostname>/t/…`) instead of `trackingBaseUrl`; without it, never.
   */
  trackingDomainProvider?: string;
  /**
   * Content screening of live emails, right before they reach the provider (the worker passes
   * `screenMessage` from `@coss/screening`). A `block` fails the email with the verdict's safe code.
   */
  screen?: (input: ScreenInput) => Promise<ScreenOutcome>;
  /** Public, size-bounded image fetcher by default; injectable for network-free tests. */
  screeningImages?: ScreeningImageLoader;
  /** Organizations whose mail must survive an unexpected screening-system failure. */
  screeningFailureAllowlist?: ReadonlySet<string>;
  /**
   * Hard usage caps (`@coss/billing`: Free's included emails), reserved in the transaction that
   * accepts a live send. Unset: nothing is capped (tests, scripts).
   */
  billing?: UsageGate;
  /**
   * Encrypts the unsubscribe and preference links added to marketing and topic emails at
   * dispatch (`EMAIL_LINK_KEYS`). Without it, marketing emails fail at dispatch and topic emails
   * go without the headers.
   */
  linkKeys?: LinkKeyRing;
};

/** A dispatch that must fail the email without calling the provider (a configuration gap). */
class DispatchRefusal extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const CONTENT_REJECTED = {
  code: "content_rejected",
  message: "The email was blocked by content screening.",
};

const SCREENING_UNAVAILABLE = {
  code: "content_screening_unavailable",
  message: "The email was held because content screening was unavailable.",
};

/** A held email is dispatched (and screened) again this long after its screening failed. */
export const SCREENING_RETRY_DELAY_S = 60;
/** How long a throttled marketing email waits before it is dispatched again. */
export const THROTTLE_RETRY_DELAY_S = 30;

export function createEmailService(opts: EmailServiceOptions): EmailService {
  const trackingBaseUrl = opts.trackingBaseUrl && withoutTrailingSlashes(opts.trackingBaseUrl);
  // Sandbox environments never reach a real provider, whatever `liveProvider` is.
  const providerFor = (sandbox: boolean) => (sandbox ? opts.sandboxProvider : opts.liveProvider);
  const broadcastContent = broadcastContentCache();

  /** A broadcast email with its broadcast's content rendered in (any other email as it is). */
  async function withBroadcastBody(row: EmailRow): Promise<EmailRow> {
    if (!row.broadcastId) return row;
    const content = await broadcastContent(row.organizationId, row.broadcastId);
    return content ? withRenderedBody(row, new Map([[row.broadcastId, content]])) : row;
  }

  /**
   * Hands a queued email to its provider and records the outcome. Never throws for provider errors.
   * Any other email (e.g. a `scheduled` one, which the worker dispatches) is returned as is.
   */
  async function deliver(row: EmailRow, sandbox: boolean): Promise<EmailObjectOutput> {
    if (row.status !== "queued") return currentEmail(row);

    const provider = providerFor(sandbox);
    // Claim the email first so concurrent dispatchers (e.g. a retried job) never send it twice.
    // `provider` is only ever set by this claim. A crash after the claim leaves the row `queued`
    // with a provider: the worker's stale-claim sweep resolves it.
    const unclaimed = and(
      eq(email.id, row.id),
      eq(email.organizationId, row.organizationId),
      eq(email.status, "queued"),
      isNull(email.provider),
    );
    if (!sandbox) {
      try {
        // A domain restriction or suspension may have arrived after acceptance. This also
        // covers unsampled messages and broadcasts whose content was screened earlier.
        await authorizeLiveSender({
          provider: provider.name,
          organizationId: row.organizationId,
          from: row.from,
          stream: row.stream,
          subaccountId: row.subaccountId,
        });
      } catch (error) {
        if (!(error instanceof EmailError)) throw error;
        // The broadcast worker owns pausing and dropping these queued rows for Resume.
        if (error.code === "marketing_paused" && row.broadcastId) return currentEmail(row);
        if (error.code !== "billing_hold") await failUnclaimed(row, error);
        return currentEmail(row);
      }
    }
    if (row.stream === "marketing") {
      if (!sandbox && (await isMarketingPaused(row.organizationId))) {
        // Paused since it was accepted. A broadcast's email is left to its worker, which pauses
        // the broadcast and drops it (made again on Resume); any other is failed, as a
        // scheduled send refused at its claim is.
        if (!row.broadcastId) await failUnclaimed(row, marketingPausedError());
        return currentEmail(row);
      }
      // Marketing email can wait in its queue for a while (a broadcast's backlog): consent is
      // checked again at the claim, as for a scheduled send.
      const claimed = await db.transaction(async (tx) => {
        const [claimedRow] = await tx
          .update(email)
          .set({ provider: provider.name, ...claimRouting(row, provider.name, sandbox) })
          .where(unclaimed)
          .returning();
        if (!claimedRow) return undefined;
        await skipIneligibleRecipients(tx, claimedRow);
        await freezeBillableRecipients(tx, claimedRow);
        return claimedRow;
      });
      if (claimed) await complete(claimed, provider, sandbox);
      return currentEmail(row);
    }
    if (row.subaccountId) {
      // Turned off, paused or deleted since it was accepted: its backlog stops with it.
      try {
        await assertSubaccountStillSends(row.organizationId, row.subaccountId);
      } catch (error) {
        if (!(error instanceof EmailError)) throw error;
        await failUnclaimed(row, error);
        return currentEmail(row);
      }
    }
    const [claimed] = await db
      .update(email)
      .set({
        provider: provider.name,
        billableRecipients: billableRecipientsSql(row),
        ...claimRouting(row, provider.name, sandbox),
      })
      .where(unclaimed)
      .returning({
        id: email.id,
        dedicatedPool: email.dedicatedPool,
        subaccountTenant: email.subaccountTenant,
        requireTls: email.requireTls,
        storeContent: email.storeContent,
        trackOpens: email.trackOpens,
        trackClicks: email.trackClicks,
      });
    if (!claimed) return currentEmail(row);
    await complete({ ...row, ...claimed }, provider, sandbox);
    return currentEmail(row);
  }

  /** Fails a queued email nobody claimed yet with a sender refusal (`email.failed`). */
  async function failUnclaimed(row: EmailRow, error: EmailError): Promise<void> {
    await db.transaction(async (tx) => {
      const [failed] = await tx
        .update(email)
        .set({ status: "failed", errorCode: error.code, errorMessage: error.message })
        .where(
          and(
            eq(email.id, row.id),
            eq(email.organizationId, row.organizationId),
            eq(email.status, "queued"),
            isNull(email.provider),
          ),
        )
        .returning({ id: email.id });
      if (!failed) return;
      await purgeSendContent(tx, row);
      await recordProviderEvent(
        tx,
        cossEvent(row, {
          type: "email.failed",
          providerEventType: "SenderRejected",
          sourceId: error.code,
          data: { failure: { code: error.code, message: error.message } },
        }),
      );
    });
  }

  /**
   * At a dispatch claim: the email's still-queued recipients suppressed (or, for marketing,
   * unsubscribed) since the send was accepted become `suppressed`, with their events.
   */
  async function skipIneligibleRecipients(tx: Transaction, claimedRow: EmailRow): Promise<void> {
    const pending = await tx
      .select({ address: emailRecipient.address })
      .from(emailRecipient)
      .where(
        and(
          eq(emailRecipient.organizationId, claimedRow.organizationId),
          eq(emailRecipient.emailId, claimedRow.id),
          eq(emailRecipient.status, "queued"),
        ),
      );
    const skipped = await skippedRecipients(
      tx,
      claimedRow,
      pending.map((recipient) => recipient.address),
      { category: claimedRow.category, stream: claimedRow.stream },
    );
    for (const [address, skip] of skipped) {
      await recordProviderEvent(tx, suppressedEvent(claimedRow, address, skip));
    }
  }

  /** Why content screening refuses a live email. Unexpected enforcement failures fail closed. */
  async function screeningFailure(
    row: EmailRow,
    sandbox: boolean,
  ): Promise<typeof CONTENT_REJECTED | typeof SCREENING_UNAVAILABLE | null> {
    // A broadcast's content was screened once, before its emails were made; one personalized
    // with contact values (which could carry any text or link) is sampled like any send.
    const personalized = Object.keys(row.variables ?? {}).length > 0;
    if (sandbox || !opts.screen || row.screeningExempt || (row.broadcastId && !personalized)) {
      return null;
    }
    const { subaccountId } = row;
    try {
      const outcome = await opts.screen({
        organizationId: row.organizationId,
        environmentId: row.environmentId,
        product: "email",
        subjectId: row.id,
        content: (signal) => loadEmailScreeningContent(row, signal, opts.screeningImages),
        force: imageDominantEmail(row),
        onBlock: (tx, now) => recordScreeningDomainBlock(tx, row, now),
        retry: row.errorCode === SCREENING_UNAVAILABLE.code,
        // A sub-account is screened on its own: a block pauses it, never the organization.
        ...(subaccountId
          ? {
              group: {
                id: subaccountId,
                reinstatedAt: async (tx) => {
                  const [group] = await tx
                    .select({ reinstatedAt: schema.emailSubaccount.reinstatedAt })
                    .from(schema.emailSubaccount)
                    .where(
                      and(
                        eq(schema.emailSubaccount.id, subaccountId),
                        eq(schema.emailSubaccount.organizationId, row.organizationId),
                      ),
                    )
                    .for("update");
                  return group?.reinstatedAt ?? null;
                },
                onBlock: (tx, block) =>
                  pauseSubaccount(tx, {
                    organizationId: row.organizationId,
                    subaccountId,
                    trigger: block.trigger,
                    now: block.now,
                  }),
              },
            }
          : {}),
      });
      if (outcome.action !== "block") return null;
      return outcome.screening?.verdict === "error" ? SCREENING_UNAVAILABLE : CONTENT_REJECTED;
    } catch (error) {
      console.error(`[email] content screening failed for ${row.id}:`, error);
      return opts.screeningFailureAllowlist?.has(row.organizationId) ? null : SCREENING_UNAVAILABLE;
    }
  }

  /**
   * When an email handed back by the provider (throttled, or screening that couldn't run) belongs
   * to a broadcast paused or canceled meanwhile, drops it like the emails nobody claimed: counter
   * and reservation given back, a paused one's cursor moved back before its contact so a resume
   * makes it again. Whether it was dropped (then nothing else may be done with it).
   */
  async function dropForStoppedBroadcast(
    tx: Transaction,
    row: EmailRow,
    provider: EmailProvider,
    sandbox: boolean,
  ): Promise<boolean> {
    if (row.broadcastId) {
      // Locked first, in the order pausing takes it.
      const [owner] = await tx
        .select({ status: broadcast.status, cursor: broadcast.cursor })
        .from(broadcast)
        .where(
          and(eq(broadcast.id, row.broadcastId), eq(broadcast.organizationId, row.organizationId)),
        )
        .for("update");
      if (owner && owner.status !== "sending") {
        const [dropped] = await tx
          .delete(email)
          .where(
            and(
              eq(email.id, row.id),
              eq(email.organizationId, row.organizationId),
              eq(email.status, "queued"),
              eq(email.provider, provider.name),
            ),
          )
          .returning({ id: email.id });
        if (!dropped) return true;
        if (
          owner.status === "paused" &&
          row.contactId &&
          owner.cursor !== null &&
          owner.cursor >= row.contactId
        ) {
          const [before] = await tx
            .select({ id: sql<string | null>`max(${contact.id})` })
            .from(contact)
            .where(
              and(
                eq(contact.organizationId, row.organizationId),
                eq(contact.environmentId, row.environmentId),
                lt(contact.id, row.contactId),
              ),
            );
          await tx
            .update(broadcast)
            .set({ cursor: before?.id ?? null })
            .where(
              and(
                eq(broadcast.id, row.broadcastId),
                eq(broadcast.organizationId, row.organizationId),
              ),
            );
        }
        await bumpBroadcastStat(tx, {
          broadcastId: row.broadcastId,
          organizationId: row.organizationId,
          emailId: row.id,
          field: "recipients",
          by: -1,
        });
        if (!sandbox) {
          await opts.billing?.release?.(tx, {
            organizationId: row.organizationId,
            meter: "email.recipients",
            quantity: 1,
            reservedAt: row.createdAt,
          });
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Gives back the claim on an email whose screening couldn't run (the classifier is down): it is
   * dispatched and screened again in `SCREENING_RETRY_DELAY_S`, and keeps being held until the
   * unclaimed sweep fails it (`content_screening_unavailable`, `UNCLAIMED_FAIL_MS` after it was
   * due). The error code marks it as held, so its retry is screened again (`retry`).
   */
  async function holdForScreening(
    row: EmailRow,
    provider: EmailProvider,
    sandbox: boolean,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      if (await dropForStoppedBroadcast(tx, row, provider, sandbox)) return;
      const [held] = await tx
        .update(email)
        .set({
          provider: null,
          errorCode: SCREENING_UNAVAILABLE.code,
          errorMessage: SCREENING_UNAVAILABLE.message,
        })
        .where(
          and(
            eq(email.id, row.id),
            eq(email.organizationId, row.organizationId),
            eq(email.status, "queued"),
            eq(email.provider, provider.name),
          ),
        )
        .returning({ id: email.id });
      if (held) {
        await opts.queue.enqueue(
          tx,
          { organizationId: row.organizationId, emailId: row.id, stream: row.stream },
          { delaySeconds: SCREENING_RETRY_DELAY_S },
        );
      }
    });
  }

  /**
   * Gives back the claim on a marketing email the provider throttled (certainly not sent): it is
   * dispatched again shortly, so a broadcast slows down instead of failing.
   */
  async function holdForThrottling(
    row: EmailRow,
    provider: EmailProvider,
    sandbox: boolean,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      if (await dropForStoppedBroadcast(tx, row, provider, sandbox)) return;
      const [held] = await tx
        .update(email)
        .set({ provider: null })
        .where(
          and(
            eq(email.id, row.id),
            eq(email.organizationId, row.organizationId),
            eq(email.status, "queued"),
            eq(email.provider, provider.name),
          ),
        )
        .returning({ id: email.id });
      if (held) {
        await opts.queue.enqueue(
          tx,
          { organizationId: row.organizationId, emailId: row.id, stream: row.stream },
          { delaySeconds: THROTTLE_RETRY_DELAY_S },
        );
      }
    });
  }

  /** Sends an email this process claimed for `provider` and records the outcome. */
  async function complete(
    claimed: EmailRow,
    provider: EmailProvider,
    sandbox: boolean,
  ): Promise<void> {
    const row = await withBroadcastBody(claimed);
    let outcome: Partial<EmailRow>;
    let events: ProviderEvent[];
    const attachments = await loadOutboundAttachments(row);
    const message = toOutbound(row, await suppressedAddresses(row), attachments ?? []);
    const hasRecipients = message.to.length + message.cc.length + message.bcc.length > 0;
    const screeningError =
      attachments !== null && hasRecipients ? await screeningFailure(row, sandbox) : null;
    if (screeningError === SCREENING_UNAVAILABLE) {
      await holdForScreening(row, provider, sandbox);
      return;
    }
    if (attachments === null) {
      // Content is only purged once an email leaves `queued`, so this means a bug elsewhere:
      // never send the email without the attachments it was requested with.
      outcome = {
        status: "failed",
        provider: provider.name,
        errorCode: "attachments_unavailable",
        errorMessage: "The email's attachments are no longer stored.",
      };
      events = [
        failedEvent(row, provider.name, {
          code: "attachments_unavailable",
          message: "The email's attachments are no longer stored.",
        }),
      ];
    } else if (!hasRecipients) {
      // Every recipient is suppressed: nothing to hand over. Each one already has its
      // `email.suppressed` event, so no `email.failed` event is added.
      outcome = {
        status: "failed",
        provider: provider.name,
        errorCode: "all_recipients_suppressed",
        errorMessage: "Every recipient is on the suppression list or unsubscribed.",
      };
      events = [];
    } else if (screeningError) {
      outcome = {
        status: "failed",
        provider: provider.name,
        errorCode: screeningError.code,
        errorMessage: screeningError.message,
      };
      events = [failedEvent(row, provider.name, screeningError)];
    } else {
      try {
        // Tracking first: the footer's unsubscribe link must never be a tracked redirect.
        const result = await provider.send(
          await withMarketing(row, await instrument(row, message)),
        );
        outcome = {
          status: "sent",
          provider: provider.name,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          // A held email that got through on a retry.
          errorCode: null,
          errorMessage: null,
        };
        events = result.events ?? [];
      } catch (error) {
        if (error instanceof DispatchRefusal) {
          outcome = {
            status: "failed",
            provider: provider.name,
            errorCode: error.code,
            errorMessage: error.message,
          };
          events = [failedEvent(row, provider.name, { code: error.code, message: error.message })];
        } else if (error instanceof ThrottledSendError && row.stream === "marketing") {
          await holdForThrottling(row, provider, sandbox);
          return;
        } else if (error instanceof UncertainSendError) {
          // The provider may be delivering it: never fail it here, and never send it again. It
          // stays claimed; the provider's `Send` event or the stale-claim sweep settles it.
          console.error(`[email] provider "${provider.name}" may have sent ${row.id}:`, error);
          return;
        } else {
          console.error(`[email] provider "${provider.name}" failed to send ${row.id}:`, error);
          outcome = {
            status: "failed",
            provider: provider.name,
            errorCode: "provider_error",
            errorMessage: errorMessage(error),
          };
          events = [failedEvent(row, provider.name)];
        }
      }
    }

    await db.transaction(async (tx) => {
      // Still guarded on `queued` so a finished email is never overwritten (e.g. by a provider
      // `Send` event that arrived before the send call returned).
      const [updated] = await tx
        .update(email)
        .set(outcome)
        .where(
          and(
            eq(email.id, row.id),
            eq(email.organizationId, row.organizationId),
            eq(email.status, "queued"),
          ),
        )
        .returning({ id: email.id });
      // Either way the email has left `queued`, so its attachments (and a discarded body) are no
      // longer needed.
      await purgeSendContent(tx, row);
      // A failure only counts if it is the recorded outcome; provider events are facts either way.
      if (!updated && outcome.status === "failed") return;
      // Billed once, whichever path got the email to `sent` first (a `Send` event that beat this
      // update meters it itself; a `Reject` that beat it means it was never sent).
      if (updated && outcome.status === "sent" && !sandbox) await recordEmailUsage(tx, row);
      for (const event of events) await recordProviderEvent(tx, event);
    });
  }

  /**
   * Hands one due scheduled email to its provider. The sender and the suppression list are
   * checked again: either may have changed since the email was scheduled.
   */
  async function dispatchScheduled(row: EmailRow, sandbox: boolean, now: Date): Promise<void> {
    const provider = providerFor(sandbox);
    // Only a still-scheduled, due email moves on; this compare-and-set is what keeps concurrent
    // workers (and a cancel) from both acting on it.
    const stillDue = and(
      eq(email.id, row.id),
      eq(email.organizationId, row.organizationId),
      eq(email.status, "scheduled"),
      isNull(email.provider),
      lte(email.scheduledAt, now),
      organizationActive(),
      sandbox ? undefined : withinBudget(),
    );

    const failScheduled = (error: EmailError) =>
      db.transaction(async (tx) => {
        const [failed] = await tx
          .update(email)
          .set({ status: "failed", errorCode: error.code, errorMessage: error.message })
          .where(stillDue)
          .returning({ id: email.id });
        if (!failed) return;
        await purgeSendContent(tx, row);
        await recordProviderEvent(
          tx,
          cossEvent(row, {
            type: "email.failed",
            providerEventType: "SenderRejected",
            sourceId: error.code,
            data: { failure: { code: error.code, message: error.message } },
          }),
        );
      });
    if (row.subaccountId) {
      try {
        await assertSubaccountStillSends(row.organizationId, row.subaccountId);
      } catch (error) {
        if (!(error instanceof EmailError)) throw error;
        await failScheduled(error);
        return;
      }
    }
    if (!sandbox) {
      try {
        await authorizeLiveSender({
          provider: provider.name,
          organizationId: row.organizationId,
          from: row.from,
          stream: row.stream,
          subaccountId: row.subaccountId,
        });
      } catch (error) {
        if (!(error instanceof EmailError)) throw error;
        // Held, not failed: it goes once the hold is lifted (like a suspension).
        if (error.code === "billing_hold") return;
        await failScheduled(error);
        return;
      }
    }

    // Claims straight from `scheduled`, so a crash after this point leaves a claimed `queued`
    // row for the stale-claim sweep, never an old unclaimed row for the queue-recovery sweep.
    const claimed = await db.transaction(async (tx) => {
      const [claimedRow] = await tx
        .update(email)
        .set({
          status: "queued",
          provider: provider.name,
          ...claimRouting(row, provider.name, sandbox),
        })
        .where(stillDue)
        .returning();
      if (!claimedRow) return undefined;
      // Again at the claim: an address suppressed (or a contact who unsubscribed) since the
      // send was accepted is skipped too.
      await skipIneligibleRecipients(tx, claimedRow);
      await freezeBillableRecipients(tx, claimedRow);
      return claimedRow;
    });
    if (claimed) await complete(claimed, provider, sandbox);
  }

  async function dispatchDue(opts: DispatchDueOptions = {}): Promise<number> {
    const now = opts.now ?? new Date();
    const due = await db
      .select({ email, mode: environment.mode })
      .from(email)
      .innerJoin(
        environment,
        and(
          eq(environment.id, email.environmentId),
          eq(environment.organizationId, email.organizationId),
        ),
      )
      .where(
        and(
          eq(email.status, "scheduled"),
          lte(email.scheduledAt, now),
          organizationActive(),
          or(eq(environment.mode, "sandbox"), withinBudget()),
          opts.scope ? inArray(email.organizationId, opts.scope.organizationIds) : undefined,
        ),
      )
      .orderBy(asc(email.scheduledAt))
      .limit(opts.limit ?? DISPATCH_DUE_LIMIT);
    for (let offset = 0; offset < due.length; offset += DISPATCH_DUE_CONCURRENCY) {
      if (opts.signal?.aborted) break;
      const batch = due.slice(offset, offset + DISPATCH_DUE_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((row) => dispatchScheduled(row.email, row.mode === "sandbox", now)),
      );
      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") {
          console.error(
            `[email] dispatching scheduled ${batch[index]?.email.id} failed:`,
            result.reason,
          );
        }
      }
    }
    return due.length;
  }

  /**
   * Adds the open pixel and click redirects to the provider's copy of the HTML and the one-click
   * unsubscribe headers to its headers (the stored email keeps the originals), storing the links
   * first, so a click can never beat its link row.
   */
  async function instrument(row: EmailRow, message: OutboundEmail): Promise<OutboundEmail> {
    const token = row.trackingToken;
    const tracksHtml = Boolean(message.html) && (row.trackOpens || row.trackClicks);
    if (!token || (!tracksHtml && !row.unsubscribe)) return message;
    if (!trackingBaseUrl) throw new Error("Tracking requires the email service's trackingBaseUrl.");
    // Resolved now, as the links are written: a tracking domain that stopped working (or was
    // removed) since the send falls back to the default host.
    const customBaseUrl = opts.trackingDomainProvider
      ? await trackingBaseUrlFor({
          organizationId: row.organizationId,
          from: row.from,
          provider: opts.trackingDomainProvider,
        })
      : null;
    const baseUrl = customBaseUrl ?? trackingBaseUrl;
    const instrumented = row.unsubscribe
      ? {
          ...message,
          headers: {
            ...message.headers,
            "List-Unsubscribe": `<${unsubscribeUrl(baseUrl, token)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : message;
    if (!message.html || (!row.trackOpens && !row.trackClicks)) return instrumented;
    const { html, links } = instrumentHtml(message.html, {
      baseUrl,
      token,
      opens: row.trackOpens,
      clicks: row.trackClicks,
    });
    if (links.length > 0) {
      await db
        .insert(emailLink)
        .values(
          links.map((link) => ({
            organizationId: row.organizationId,
            emailId: row.id,
            position: link.position,
            url: link.url,
          })),
        )
        .onConflictDoNothing({ target: [emailLink.emailId, emailLink.position] });
    }
    return { ...instrumented, html };
  }

  /** The origin of the email's links: its custom tracking domain when active, else the default. */
  async function linkBaseUrl(row: EmailRow): Promise<string> {
    if (!trackingBaseUrl) throw new Error("Links require the email service's trackingBaseUrl.");
    const custom = opts.trackingDomainProvider
      ? await trackingBaseUrlFor({
          organizationId: row.organizationId,
          from: row.from,
          provider: opts.trackingDomainProvider,
        })
      : null;
    return custom ?? trackingBaseUrl;
  }

  /**
   * Marketing email, and single-recipient email about a topic, gets one-click unsubscribe headers
   * (RFC 8058) for its recipient; marketing email also its footer (postal address, unsubscribe
   * and preference links; `marketing-footer.ts`). On the provider's copy only.
   */
  async function withMarketing(row: EmailRow, message: OutboundEmail): Promise<OutboundEmail> {
    // Topics and the preference center are the environment's own audience: a sub-account's email
    // keeps its per-category unsubscribe, which suppresses for that sub-account (`instrument`).
    if (row.subaccountId) return message;
    const marketing = row.stream === "marketing";
    const env = { organizationId: row.organizationId, environmentId: row.environmentId };
    const topic = row.category ? (await topicsByKey(env, [row.category])).get(row.category) : null;
    if (!marketing && !topic) return message;
    const recipients = [...message.to, ...message.cc, ...message.bcc];
    if (!opts.linkKeys) {
      if (marketing) {
        throw new DispatchRefusal(
          "marketing_unavailable",
          "Marketing email can't be sent: this deployment has no EMAIL_LINK_KEYS.",
        );
      }
      return message;
    }
    // Links are personal: an email to several people gets none. Marketing has exactly one
    // (validated at send, by address: `to` and `cc` may repeat it) and never goes without them.
    const addresses = new Set(recipients.map(bareAddress));
    if (addresses.size !== 1) {
      if (!marketing) return message;
      throw new DispatchRefusal(
        "invalid_recipients",
        "A marketing email goes to exactly one recipient.",
      );
    }
    // A topic email keeps the customer's own List-Unsubscribe headers, and goes without ours when
    // they wouldn't fit the provider's header limit (marketing validated both at send).
    const own = Object.keys(row.headers);
    if (
      !marketing &&
      (LIST_UNSUBSCRIBE_HEADERS.some((name) => own.includes(name)) ||
        own.length > MAX_HEADERS_WITH_UNSUBSCRIBE)
    ) {
      return message;
    }
    const links = preferenceLinks({
      baseUrl: await linkBaseUrl(row),
      keys: opts.linkKeys,
      environmentId: row.environmentId,
      address: [...addresses][0] as string,
      emailId: row.id,
      topic: topic?.key ?? null,
    });
    // These replace the per-category unsubscribe headers `instrument` may have added: the
    // preference center is the topic's (and marketing's) unsubscribe. (None fit a header only for
    // a very long address: the body links and any headers `instrument` added remain.)
    const next = links.headers
      ? { ...message, headers: { ...message.headers, ...links.headers } }
      : message;
    if (!marketing) return next;
    const mailingAddress = (await getMarketingSettingsRow(env))?.mailingAddress;
    if (!mailingAddress) {
      throw new DispatchRefusal(
        "mailing_address_required",
        "The environment's postal address was removed before this marketing email went out.",
      );
    }
    const content = applyMarketingFooter(next, {
      unsubscribeUrl: links.unsubscribeUrl,
      preferencesUrl: links.preferencesUrl,
      mailingAddress,
    });
    return { ...next, ...content };
  }

  async function dispatch(input: {
    organizationId: string;
    emailId: string;
  }): Promise<EmailObjectOutput> {
    const [found] = isId("email", input.emailId)
      ? await selectEmailsWithMode(input.organizationId, eq(email.id, input.emailId), 1)
      : [];
    if (!found) throw new EmailError("not_found", "Email not found.");
    return deliver(found.email, found.sandbox);
  }

  /** The email an unexpired idempotency key with the same request hash points at. */
  async function findReplay(
    environment: SendEnvironment,
    idempotencyKey: string,
    requestHash: string | null,
    retentionMs = IDEMPOTENCY_KEY_TTL_MS,
  ): Promise<EmailObjectOutput | null> {
    const [existing] = await db
      .select()
      .from(email)
      .where(sameEmailKey(environment, idempotencyKey))
      .limit(1);
    if (!existing || !isReplayOf(existing, requestHash, retentionMs)) return null;
    const [object] = await toEmailObjects(environment.organizationId, [
      { email: existing, sandbox: environment.mode === "sandbox" },
    ]);
    return object ?? null;
  }

  /** The batch an unexpired idempotency key with the same request hash points at. */
  async function findBatchReplay(
    environment: SendEnvironment,
    idempotencyKey: string,
    requestHash: string | null,
  ): Promise<EmailBatchObjectOutput | null> {
    const [existing] = await db
      .select()
      .from(emailBatch)
      .where(sameBatchKey(environment, idempotencyKey))
      .limit(1);
    if (!existing || !isReplayOf(existing, requestHash)) return null;
    return toEmailBatchObject(existing, environment.mode === "sandbox");
  }

  /**
   * Everything about one email that is decided before its insert transaction (which may be
   * retried): tracking, status, row values and decoded attachments.
   */
  async function prepareSend(
    environment: SendEnvironment,
    key: { apiKeyId: string | null; apiKeyOwnerId?: string | null },
    params: SendEmailRequestOutput,
    caches: {
      tracking: Map<string, Promise<ResolvedTracking>>;
      templates: TemplateVersionCache;
      /** The environment's content storage, read once per request. */
      storeContent?: Promise<boolean>;
    },
    opts: {
      discardBody?: boolean;
      screeningExempt?: boolean;
      hipaaOrigin?: boolean;
      templateDraft?: { revision: number };
      paramPrefix?: string;
    } = {},
  ): Promise<PreparedSend> {
    // Rendered once, at send: a later publish never changes a stored (or scheduled) email.
    const content =
      params.template_id === undefined
        ? null
        : await renderTemplateForSend(
            environment,
            {
              templateId: params.template_id,
              version: params.template_version,
              locale: params.locale,
              variables: params.variables ?? {},
              draft: opts.templateDraft,
            },
            { cache: caches.templates, paramPrefix: opts.paramPrefix },
          );
    const subject = content?.subject ?? params.subject;
    // Guaranteed by `SendEmailRequest` for sends without a template.
    if (subject === null) throw new Error("A send without a template needs a subject.");
    const scheduledAt = params.scheduled_at === undefined ? null : new Date(params.scheduled_at);
    // A time that is not in the future sends now (still recorded as `scheduled_at`).
    const scheduled = scheduledAt !== null && scheduledAt.getTime() > Date.now();

    // Resolved once, at send: later changes to the settings never affect a stored email.
    const trackingKey = canonicalJson([params.category ?? null, params.tracking ?? null]);
    let resolving = caches.tracking.get(trackingKey);
    if (!resolving) {
      resolving = resolveTracking(db, environment, params.category ?? null, params.tracking);
      caches.tracking.set(trackingKey, resolving);
    }
    const tracking = await resolving;
    caches.storeContent ??= resolveStoreContent(db, environment);
    const storeContent = await caches.storeContent;
    // The unsubscribe is scoped to the category and names one recipient (one provider message
    // goes to every recipient), the customer's own List-Unsubscribe headers win, and the two
    // headers must still fit the provider's header limit. An explicit `tracking.unsubscribe` that
    // can't be honored was already refused by validation. Marketing email gets the preference
    // center's headers instead (`withMarketing`).
    const unsubscribe =
      tracking.unsubscribe &&
      params.stream !== "marketing" &&
      params.category !== undefined &&
      uniqueRecipientCount(params) === 1 &&
      !LIST_UNSUBSCRIBE_HEADERS.some((name) => name in params.headers) &&
      Object.keys(params.headers).length <= MAX_HEADERS_WITH_UNSUBSCRIBE;
    if ((tracking.opens || tracking.clicks || unsubscribe) && !trackingBaseUrl) {
      throw new Error("Tracking requires the email service's trackingBaseUrl.");
    }
    const stream = params.stream ?? "transactional";
    // Email for platforms: resolved (and checked) once per send; the claim checks it again.
    const subaccount =
      params.subaccount === undefined
        ? null
        : await sendingSubaccount({
            organizationId: environment.organizationId,
            environmentId: environment.environmentId,
            ref: params.subaccount,
            param: `${opts.paramPrefix ?? ""}subaccount`,
          });
    // CAN-SPAM: every marketing email carries the sender's postal address.
    if (stream === "marketing" && !(await getMarketingSettingsRow(environment))?.mailingAddress) {
      throw new EmailError(
        "mailing_address_required",
        "Marketing email needs this environment's postal address: set it in the marketing " +
          "settings (PATCH /v1/marketing_settings) first.",
        { param: "stream" },
      );
    }

    return {
      // Tenancy columns always come from the authenticated environment, never from the request.
      values: {
        organizationId: environment.organizationId,
        projectId: environment.projectId,
        environmentId: environment.environmentId,
        apiKeyId: key.apiKeyId,
        apiKeyOwnerId: key.apiKeyOwnerId ?? null,
        status: scheduled ? "scheduled" : "queued",
        scheduledAt,
        from: params.from,
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        replyTo: params.reply_to,
        subject,
        html: content ? content.html : params.html,
        text: content ? content.text : params.text,
        discardBody: opts.discardBody ?? false,
        screeningExempt: Boolean(opts.screeningExempt || opts.hipaaOrigin),
        hipaaOrigin: opts.hipaaOrigin ?? false,
        storeContent: storeContent && !opts.hipaaOrigin,
        headers: params.headers,
        tags: params.tags,
        category: params.category ?? null,
        stream,
        trackOpens: tracking.opens,
        trackClicks: tracking.clicks,
        unsubscribe,
        templateId: content?.template.id ?? null,
        templateVersion: content?.template.version ?? null,
        templateLocale: content?.template.locale ?? null,
        subaccountId: subaccount?.id ?? null,
      },
      scheduled,
      // Decoded once, outside the (retried) insert transaction.
      attachments: prepareAttachments(params),
    };
  }

  /**
   * Inserts a prepared email and, only if this request won the insert, its recipients and
   * dispatch job: atomically, so a stored email always has its recipient rows and is always
   * dispatched. Recipients on the suppression list are stored `suppressed` (with an
   * `email.suppressed` event) and never handed to the provider.
   */
  async function insertPrepared(
    tx: Transaction,
    environment: SendEnvironment,
    prepared: PreparedSend,
    extra: Pick<
      typeof email.$inferInsert,
      "idempotencyKey" | "requestHash" | "batchId" | "batchIndex" | "traceparent"
    >,
  ): Promise<{ row: EmailRow; billable: number } | undefined> {
    const tracked =
      prepared.values.trackOpens || prepared.values.trackClicks || prepared.values.unsubscribe;
    const [row] = await tx
      .insert(email)
      .values({
        ...prepared.values,
        ...extra,
        trackingToken: tracked ? newTrackingToken() : null,
      })
      .onConflictDoNothing({ target: [email.environmentId, email.idempotencyKey] })
      .returning();
    if (!row) return undefined;
    const recipients = recipientRows(row);
    const suppressed = await skippedRecipients(
      tx,
      { ...environment, subaccountId: row.subaccountId },
      recipients.map((recipient) => recipient.address),
      { category: row.category, stream: row.stream },
    );
    await tx.insert(emailRecipient).values(recipients);
    await insertAttachments(tx, row, prepared.attachments);
    if (row.status === "scheduled") {
      await recordProviderEvent(
        tx,
        cossEvent(row, {
          type: "email.scheduled",
          providerEventType: "Scheduled",
          sourceId: "scheduled",
          data: {},
        }),
      );
    }
    for (const [address, entry] of suppressed) {
      await recordProviderEvent(tx, suppressedEvent(row, address, entry));
    }
    if (!prepared.scheduled) {
      await opts.queue.enqueue(tx, {
        organizationId: row.organizationId,
        emailId: row.id,
        stream: row.stream,
      });
    }
    return { row, billable: recipients.length - suppressed.size };
  }

  /** Reserves capped usage (Free's allowance) as the transaction's last statement. */
  async function reserveUsage(tx: Transaction, environment: SendEnvironment, recipients: number) {
    if (environment.mode !== "live" || !opts.billing) return;
    await opts.billing.reserve(tx, {
      organizationId: environment.organizationId,
      meter: "email.recipients",
      quantity: recipients,
    });
  }

  async function send(
    input: SendEmailInput,
  ): Promise<{ email: EmailObjectOutput; replayed: boolean }> {
    const { environment, params } = input;
    const retentionMs = input.idempotencyRetentionMs ?? IDEMPOTENCY_KEY_TTL_MS;
    const sandbox = environment.mode === "sandbox";
    const idempotencyKey = input.idempotencyKey || null;
    const requestHash = idempotencyKey
      ? (input.requestHash ?? hashSendRequest(params, { discardBody: input.discardBody }))
      : null;
    let prepared: PreparedSend;
    try {
      prepared = await prepareSend(
        environment,
        input,
        params,
        { tracking: new Map(), templates: new Map() },
        {
          discardBody: input.discardBody,
          screeningExempt: input.screeningExempt,
          hipaaOrigin: input.hipaaOrigin,
          templateDraft: input.templateDraft,
        },
      );
    } catch (error) {
      // A retry of a request that already succeeded still replays, even if its template changed
      // (or was deleted) since.
      const replay =
        error instanceof EmailError &&
        idempotencyKey &&
        (await findReplay(environment, idempotencyKey, requestHash, retentionMs));
      if (replay) return { email: replay, replayed: true };
      throw error;
    }

    if (!sandbox) {
      try {
        await authorizeLiveSender({
          provider: opts.liveProvider.name,
          organizationId: environment.organizationId,
          from: params.from,
          stream: params.stream ?? "transactional",
          subaccountId: prepared.values.subaccountId,
        });
        await assertWithinBudget({
          organizationId: environment.organizationId,
          projectId: environment.projectId,
          apiKeyId: input.apiKeyId,
          userId: input.apiKeyOwnerId,
        });
      } catch (error) {
        // A retry of a request that already succeeded still replays, even if the domain changed since.
        const replay =
          idempotencyKey &&
          (await findReplay(environment, idempotencyKey, requestHash, retentionMs));
        if (replay) return { email: replay, replayed: true };
        throw error;
      }
    }

    const insertEmail = async (tx: Transaction) => {
      const inserted = await insertPrepared(tx, environment, prepared, {
        idempotencyKey,
        requestHash,
        traceparent: input.traceparent ?? null,
      });
      if (!inserted) return undefined;
      await input.afterInsert?.(tx, inserted.row);
      await reserveUsage(tx, environment, inserted.billable);
      return inserted.row;
    };
    const stored = async (row: EmailRow, replayed: boolean) => {
      const [object] = await toEmailObjects(environment.organizationId, [{ email: row, sandbox }]);
      if (!object) throw new Error("Email serialization produced no object.");
      return { email: object, replayed };
    };

    if (!idempotencyKey || !requestHash) {
      const row = await db.transaction((tx) => insertEmail(tx));
      if (!row) throw new Error("Email insert returned no row.");
      return stored(row, false);
    }

    const { row, replayed } = await withIdempotencyKey({
      requestHash,
      retentionMs,
      errors: IDEMPOTENCY_ERRORS,
      insert: insertEmail,
      existing: async () => {
        const [existing] = await db
          .select()
          .from(email)
          .where(sameEmailKey(environment, idempotencyKey))
          .limit(1);
        return existing;
      },
      release: (tx, existing) =>
        tx
          .update(email)
          .set({ idempotencyKey: null })
          .where(and(eq(email.id, existing.id), eq(email.idempotencyKey, idempotencyKey))),
    });
    return stored(row, replayed);
  }

  async function sendBatch(
    input: SendEmailBatchInput,
  ): Promise<{ batch: EmailBatchObjectOutput; replayed: boolean }> {
    const { environment, emails: items } = input;
    const sandbox = environment.mode === "sandbox";
    const idempotencyKey = input.idempotencyKey || null;
    const requestHash = idempotencyKey ? hashSendBatchRequest(items) : null;
    const caches = { tracking: new Map(), templates: new Map() };
    const prepared: PreparedSend[] = [];
    try {
      for (const [index, params] of items.entries()) {
        prepared.push(
          await prepareSend(environment, input, params, caches, {
            paramPrefix: `emails.${index}.`,
          }),
        );
      }
    } catch (error) {
      // A retry of a request that already succeeded still replays, even if a template changed since.
      const replay =
        error instanceof EmailError &&
        idempotencyKey &&
        (await findBatchReplay(environment, idempotencyKey, requestHash));
      if (replay) return { batch: replay, replayed: true };
      throw error;
    }

    if (!sandbox) {
      // Every sender is checked before anything is stored: the batch is accepted as a whole.
      const senders = new Map<
        string,
        { from: string; stream: EmailStream; subaccountId: string | null; index: number }
      >();
      items.forEach((params, index) => {
        const stream = params.stream ?? "transactional";
        const subaccountId = prepared[index]?.values.subaccountId ?? null;
        const key = `${stream}\0${params.from}\0${subaccountId ?? ""}`;
        if (!senders.has(key)) senders.set(key, { from: params.from, stream, subaccountId, index });
      });
      try {
        for (const { from, stream, subaccountId, index } of senders.values()) {
          try {
            await authorizeLiveSender({
              provider: opts.liveProvider.name,
              organizationId: environment.organizationId,
              from,
              stream,
              subaccountId,
            });
          } catch (error) {
            if (error instanceof EmailError && error.code === "domain_not_verified") {
              throw new EmailError(error.code, error.message, { param: `emails.${index}.from` });
            }
            throw error;
          }
        }
        await assertWithinBudget({
          organizationId: environment.organizationId,
          projectId: environment.projectId,
          apiKeyId: input.apiKeyId,
          userId: input.apiKeyOwnerId,
        });
      } catch (error) {
        // A retry of a request that already succeeded still replays, even if a domain changed since.
        const replay =
          idempotencyKey && (await findBatchReplay(environment, idempotencyKey, requestHash));
        if (replay) return { batch: replay, replayed: true };
        throw error;
      }
    }

    // The batch row and every email (with its recipients, events and dispatch job) commit
    // together: a batch is never partially stored.
    const insertBatch = async (tx: Transaction): Promise<EmailBatchRow | undefined> => {
      const [batch] = await tx
        .insert(emailBatch)
        .values({
          organizationId: environment.organizationId,
          projectId: environment.projectId,
          environmentId: environment.environmentId,
          apiKeyId: input.apiKeyId,
          idempotencyKey,
          requestHash,
        })
        .onConflictDoNothing({ target: [emailBatch.environmentId, emailBatch.idempotencyKey] })
        .returning();
      if (!batch) return batch;
      let billable = 0;
      for (const [batchIndex, item] of prepared.entries()) {
        const inserted = await insertPrepared(tx, environment, item, {
          batchId: batch.id,
          batchIndex,
          traceparent: input.traceparent ?? null,
        });
        if (!inserted) throw new Error("Batch email insert returned no row.");
        billable += inserted.billable;
      }
      // One reservation for the whole batch: it is accepted or refused as a whole.
      await reserveUsage(tx, environment, billable);
      return batch;
    };

    if (!idempotencyKey || !requestHash) {
      const batch = await db.transaction((tx) => insertBatch(tx));
      if (!batch) throw new Error("Email batch insert returned no row.");
      return { batch: await toEmailBatchObject(batch, sandbox), replayed: false };
    }

    const { row, replayed } = await withIdempotencyKey({
      requestHash,
      errors: IDEMPOTENCY_ERRORS,
      insert: insertBatch,
      existing: async () => {
        const [existing] = await db
          .select()
          .from(emailBatch)
          .where(sameBatchKey(environment, idempotencyKey))
          .limit(1);
        return existing;
      },
      release: (tx, existing) =>
        tx
          .update(emailBatch)
          .set({ idempotencyKey: null })
          .where(
            and(eq(emailBatch.id, existing.id), eq(emailBatch.idempotencyKey, idempotencyKey)),
          ),
    });
    return { batch: await toEmailBatchObject(row, sandbox), replayed };
  }

  async function replay(input: SendEmailInput): Promise<EmailObjectOutput | null> {
    if (!input.idempotencyKey) return null;
    return findReplay(
      input.environment,
      input.idempotencyKey,
      input.requestHash ?? hashSendRequest(input.params, { discardBody: input.discardBody }),
      input.idempotencyRetentionMs,
    );
  }

  async function replayBatch(input: SendEmailBatchInput): Promise<EmailBatchObjectOutput | null> {
    if (!input.idempotencyKey) return null;
    return findBatchReplay(
      input.environment,
      input.idempotencyKey,
      hashSendBatchRequest(input.emails),
    );
  }

  return {
    send,
    sendBatch,
    dispatch,
    replay,
    replayBatch,
    cancel: cancelScheduledEmail,
    reschedule: rescheduleEmail,
    dispatchDue,
    messageIdOf(row) {
      if (!row.provider || !row.providerMessageId) return null;
      const provider = [opts.liveProvider, opts.sandboxProvider].find(
        (candidate) => candidate.name === row.provider,
      );
      return provider?.messageId?.(row.providerMessageId) ?? null;
    },
  };
}

type EmailBatchRow = typeof emailBatch.$inferSelect;

type PreparedSend = {
  values: Omit<
    typeof email.$inferInsert,
    "idempotencyKey" | "requestHash" | "batchId" | "batchIndex"
  >;
  scheduled: boolean;
  attachments: ReturnType<typeof prepareAttachments>;
};

function sameEmailKey(environment: SendEnvironment, idempotencyKey: string) {
  return and(
    eq(email.organizationId, environment.organizationId),
    eq(email.environmentId, environment.environmentId),
    eq(email.idempotencyKey, idempotencyKey),
  );
}

function sameBatchKey(environment: SendEnvironment, idempotencyKey: string) {
  return and(
    eq(emailBatch.organizationId, environment.organizationId),
    eq(emailBatch.environmentId, environment.environmentId),
    eq(emailBatch.idempotencyKey, idempotencyKey),
  );
}

async function currentEmail(row: EmailRow): Promise<EmailObjectOutput> {
  const [current] = await selectEmailsWithMode(row.organizationId, eq(email.id, row.id), 1);
  if (!current) throw new EmailError("not_found", "Email not found.");
  const [object] = await toEmailObjects(row.organizationId, [current]);
  if (!object) throw new EmailError("not_found", "Email not found.");
  return object;
}

/** An email of the environment; malformed ids and other environments' emails are "not found". */
async function environmentEmail(input: {
  organizationId: string;
  environmentId: string;
  emailId: string;
}): Promise<EmailRow> {
  const [found] = isId("email", input.emailId)
    ? await selectEmailsWithMode(
        input.organizationId,
        and(eq(email.environmentId, input.environmentId), eq(email.id, input.emailId)),
        1,
      )
    : [];
  if (!found) throw new EmailError("not_found", "Email not found.");
  return found.email;
}

export async function cancelScheduledEmail(input: {
  organizationId: string;
  environmentId: string;
  emailId: string;
}): Promise<EmailObjectOutput> {
  const row = await environmentEmail(input);
  await db.transaction(async (tx) => {
    const [canceled] = await tx
      .update(email)
      .set({ status: "canceled" })
      .where(
        and(
          eq(email.id, row.id),
          eq(email.organizationId, row.organizationId),
          eq(email.status, "scheduled"),
          isNull(email.provider),
        ),
      )
      .returning({ id: email.id });
    if (!canceled) return;
    await purgeSendContent(tx, row);
    await recordProviderEvent(
      tx,
      cossEvent(row, {
        type: "email.canceled",
        providerEventType: "Canceled",
        sourceId: "canceled",
        data: {},
      }),
    );
  });
  const current = await currentEmail(row);
  if (current.status !== "canceled") {
    throw new EmailError(
      "email_not_cancelable",
      `Only scheduled emails can be canceled; this email is ${current.status}.`,
    );
  }
  return current;
}

/**
 * Moves a scheduled email to `scheduledAt` (validated by `RescheduleEmailRequest`: at most 30 days
 * ahead; a past time makes it due now) and records `email.rescheduled`. The same time again
 * returns the email unchanged, without an event.
 */
export async function rescheduleEmail(input: {
  organizationId: string;
  environmentId: string;
  emailId: string;
  scheduledAt: string;
}): Promise<EmailObjectOutput> {
  const row = await environmentEmail(input);
  const scheduledAt = new Date(input.scheduledAt);
  const stillScheduled = await db.transaction(async (tx) => {
    // The row lock makes a worker claiming the email concurrently wait for this commit, after
    // which its compare-and-set re-checks `scheduled_at` against the new time.
    const [current] = await tx
      .select({ scheduledAt: email.scheduledAt })
      .from(email)
      .where(
        and(
          eq(email.id, row.id),
          eq(email.organizationId, row.organizationId),
          eq(email.status, "scheduled"),
          isNull(email.provider),
        ),
      )
      .for("update");
    const previous = current?.scheduledAt;
    if (!previous) return false;
    if (previous.getTime() === scheduledAt.getTime()) return true;
    await tx
      .update(email)
      .set({ scheduledAt })
      .where(and(eq(email.id, row.id), eq(email.organizationId, row.organizationId)));
    await recordProviderEvent(
      tx,
      cossEvent(row, {
        type: "email.rescheduled",
        providerEventType: "Rescheduled",
        // Every reschedule is its own event, even back to an earlier time.
        sourceId: randomUUID(),
        data: {
          reschedule: {
            scheduled_at: scheduledAt.toISOString(),
            previous_scheduled_at: previous.toISOString(),
          },
        },
      }),
    );
    return true;
  });
  const current = await currentEmail(row);
  if (!stillScheduled) {
    throw new EmailError(
      "email_not_reschedulable",
      `Only scheduled emails can be rescheduled; this email is ${current.status}.`,
    );
  }
  return current;
}
