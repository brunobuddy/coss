/**
 * Receiving email (system-level: the worker, for every provider notification; the dashboard's
 * simulator in development). A message is routed by its *envelope* recipients:
 * `<anything>@<label>.<managed domain>` reaches the environment owning the label, and an address
 * at a receiving domain's hostname reaches that domain's environment while the domain is verified
 * and still the most specific domain covering the hostname across organizations. Every
 * environment gets its own row naming only its own recipients, so Bcc'd addresses never leak to
 * another organization. Unroutable recipients are dropped without a bounce (no backscatter).
 *
 * Content is written to the content store first, then the row, its attachments, a log line and
 * the `email.received` webhook in one transaction. A notification delivered twice records the
 * message once (unique provider message id per environment); content written for a duplicate is
 * deleted again. A message with a virus verdict keeps only its envelope and verdicts (`blocked`).
 *
 * Inboxes among an environment's recipients file the message into a thread in the same
 * transaction (`inboxes.ts`).
 *
 * Every stored copy of a message the receiving provider took is billed (`email.received`, in any
 * environment: it is real mail), unless it has a spam or virus verdict. The fake provider's (the
 * dashboard's test emails) are free. A billed copy past the included size is also billed by the MB
 * (`email.received_data`). A capped plan's allowance is reserved in the transaction that stores the
 * copy, so a failed attempt reserves nothing; past it the copy (and the content written for it) is
 * dropped and counted like one over the daily limit. A daily data limit (`dataQuota`) does the same
 * before any content is written, spam included: anyone can mail an address, and small messages
 * cost nothing against either, so a stranger's large ones never stop an organization's other mail.
 *
 * Recipients that are DMARC report addresses (`dmarc-<token>@<managed domain>`) are split off
 * first and ingested as reports (`dmarc-reports.ts`); they never become received emails.
 */
import { randomBytes } from "node:crypto";
import type { UsageGate } from "@coss/billing/gate";
import { billableEmailMegabytes, recordUsage } from "@coss/billing/metering";
import { db, schema } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { appendLogEntries } from "@coss/logs";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { ingestDmarcReports, splitDmarcReportRecipients } from "./dmarc-reports.ts";
import { domainSuffixes } from "./domains.ts";
import { managedLabelOf } from "./inbound-address.ts";
import {
  type ParsedInboundMessage,
  parseInboundMessage,
  scrubEnvelopeHeaders,
  scrubParsedHeaders,
} from "./inbound-mime.ts";
import { type InboundContentStore, receivedEmailPrefix } from "./inbound-store.ts";
import { recordInboundInboxMessages } from "./inboxes.ts";
import type { StoredReceivedEmailWebhookEvent, VERDICT_STATUSES } from "./schemas.ts";

const {
  domain,
  environment,
  environmentInboundAddress,
  inboundDropCounter,
  organizationDeletion,
  receivedEmail,
  receivedEmailAttachment,
  receivingDomain,
} = schema;

export type VerdictStatus = (typeof VERDICT_STATUSES)[number];

export type InboundVerdicts = {
  spam: VerdictStatus | null;
  virus: VerdictStatus | null;
  spf: VerdictStatus | null;
  dkim: VerdictStatus | null;
  dmarc: VerdictStatus | null;
  /** The sender domain's DMARC policy, reported when DMARC failed. */
  dmarcPolicy: string | null;
};

export const NO_VERDICTS: InboundVerdicts = {
  spam: null,
  virus: null,
  spf: null,
  dkim: null,
  dmarc: null,
  dmarcPolicy: null,
};

/** One message as the receiving provider handed it over. */
export type InboundMessage = {
  provider: string;
  /** The provider's id of the message (SES: `mail.messageId`); deduplicates notifications. */
  providerMessageId: string;
  /** Envelope sender (`MAIL FROM`); empty for bounces. */
  mailFrom: string;
  /** Envelope recipients (`RCPT TO`) the provider accepted the message for. */
  recipients: readonly string[];
  /** The raw message, loaded on demand (only when some recipient is routed). */
  raw: () => Promise<Uint8Array>;
  verdicts: InboundVerdicts;
  receivedAt: Date;
};

/** Each organization's daily inbound limit (the worker wires `email.inbound.day`). */
export type InboundQuota = {
  /** Charges one received email to the organization; `false` when it is over its limit. */
  consume(organizationId: string, messageKey: string): Promise<boolean>;
};

/** Each organization's daily limit of received data (`email.inbound.megabytes.day`). */
export type InboundDataQuota = {
  /** Charges the MB a message bills on `email.received_data`; `false` when it is over its limit. */
  consume(organizationId: string, messageKey: string, megabytes: number): Promise<boolean>;
};

export type InboundDeps = {
  store: InboundContentStore;
  managedDomain: string;
  quota?: InboundQuota | null;
  dataQuota?: InboundDataQuota | null;
  /** Each organization's daily DMARC report budget (the worker wires `email.dmarc_reports.day`). */
  dmarcQuota?: InboundQuota | null;
  /** Capped plans' allowance of received email (`createUsageGate`). Defaults to none. */
  billing?: UsageGate | null;
};

/** Whether a stored copy of `message` is billed as `email.received` (see the module comment). */
export function isBillableReceipt(message: Pick<InboundMessage, "provider" | "verdicts">): boolean {
  return (
    message.provider !== "fake" &&
    message.verdicts.virus !== "fail" &&
    message.verdicts.spam !== "fail"
  );
}

/** A capped plan's allowance refused the copy (a `BillingError` from `UsageGate.reserve`). */
function isAllowanceRefusal(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "usage_limit_exceeded" || code === "plan_feature_unavailable";
}

export type ReceiveOutcome =
  | {
      kind: "received" | "blocked";
      environmentId: string;
      receivedEmailId: string;
      recipients: string[];
    }
  | { kind: "duplicate"; environmentId: string; receivedEmailId: string; recipients: string[] }
  | { kind: "over_limit"; environmentId: string; recipients: string[] };

type Route = {
  organizationId: string;
  projectId: string;
  environmentId: string;
  mode: "live" | "sandbox";
  recipients: string[];
};

function bareRecipient(value: string): { address: string; domain: string } | null {
  const address = value.trim().replace(/^<|>$/g, "").toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  return { address, domain: address.slice(at + 1).replace(/\.$/, "") };
}

/** Envelope recipients grouped by the environment they are delivered to. */
export async function routeRecipients(
  recipients: readonly string[],
  managedDomain: string,
): Promise<Route[]> {
  const parsed = recipients.flatMap((value) => {
    const recipient = bareRecipient(value);
    return recipient ? [recipient] : [];
  });
  const byDomain = new Map<string, string[]>();
  for (const recipient of parsed) {
    const list = byDomain.get(recipient.domain) ?? [];
    if (!list.includes(recipient.address)) list.push(recipient.address);
    byDomain.set(recipient.domain, list);
  }
  const target = new Map<string, Omit<Route, "recipients">>();

  const labels = new Map<string, string>();
  for (const name of byDomain.keys()) {
    const label = managedLabelOf(name, managedDomain);
    if (label) labels.set(label, name);
  }
  if (labels.size > 0) {
    const rows = await db
      .select({
        label: environmentInboundAddress.label,
        organizationId: environment.organizationId,
        projectId: environment.projectId,
        environmentId: environment.id,
        mode: environment.mode,
      })
      .from(environmentInboundAddress)
      .innerJoin(
        environment,
        and(
          eq(environment.id, environmentInboundAddress.environmentId),
          eq(environment.organizationId, environmentInboundAddress.organizationId),
        ),
      )
      .where(inArray(environmentInboundAddress.label, [...labels.keys()]));
    for (const row of rows) {
      const name = labels.get(row.label);
      if (name) target.set(name, row);
    }
  }

  const hostnames = [...byDomain.keys()].filter((name) => !target.has(name));
  if (hostnames.length > 0) {
    const rows = await db
      .select({
        hostname: receivingDomain.hostname,
        domainId: receivingDomain.domainId,
        organizationId: environment.organizationId,
        projectId: environment.projectId,
        environmentId: environment.id,
        mode: environment.mode,
      })
      .from(receivingDomain)
      .innerJoin(
        domain,
        and(
          eq(domain.id, receivingDomain.domainId),
          eq(domain.organizationId, receivingDomain.organizationId),
        ),
      )
      .innerJoin(
        environment,
        and(
          eq(environment.id, receivingDomain.environmentId),
          eq(environment.organizationId, receivingDomain.organizationId),
        ),
      )
      .where(
        and(
          inArray(receivingDomain.hostname, hostnames),
          inArray(domain.status, ["verified", "temporary_failure"]),
        ),
      );
    if (rows.length > 0) {
      // The most specific non-failed domain covering the hostname must still be the receiving
      // domain's own: another organization may have verified a more specific one since.
      const suffixes = [...new Set(rows.flatMap((row) => domainSuffixes(row.hostname)))];
      const candidates = await db
        .select({ id: domain.id, name: domain.name })
        .from(domain)
        .where(and(inArray(domain.name, suffixes), ne(domain.status, "failed")));
      for (const row of rows) {
        const owner = candidates
          .filter((candidate) => domainSuffixes(row.hostname).includes(candidate.name))
          .sort((a, b) => b.name.length - a.name.length)[0];
        if (owner?.id === row.domainId) target.set(row.hostname, row);
      }
    }
  }

  const routes = new Map<string, Route>();
  for (const [name, addresses] of byDomain) {
    const destination = target.get(name);
    if (!destination) continue;
    const route = routes.get(destination.environmentId) ?? {
      organizationId: destination.organizationId,
      projectId: destination.projectId,
      environmentId: destination.environmentId,
      mode: destination.mode,
      recipients: [],
    };
    route.recipients.push(...addresses);
    routes.set(destination.environmentId, route);
  }
  if (routes.size === 0) return [];

  // Organizations being deleted receive nothing more.
  const deleting = await db
    .select({ organizationId: organizationDeletion.organizationId })
    .from(organizationDeletion)
    .where(
      and(
        inArray(organizationDeletion.organizationId, [
          ...new Set([...routes.values()].map((route) => route.organizationId)),
        ]),
        eq(organizationDeletion.status, "pending"),
      ),
    );
  const gone = new Set(deleting.map((row) => row.organizationId));
  return [...routes.values()].filter((route) => !gone.has(route.organizationId));
}

async function findExisting(
  route: Route,
  message: Pick<InboundMessage, "provider" | "providerMessageId">,
): Promise<string | null> {
  const [row] = await db
    .select({ id: receivedEmail.id })
    .from(receivedEmail)
    .where(
      and(
        eq(receivedEmail.environmentId, route.environmentId),
        eq(receivedEmail.provider, message.provider),
        eq(receivedEmail.providerMessageId, message.providerMessageId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

async function countDrop(organizationId: string, now: Date): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  await db
    .insert(inboundDropCounter)
    .values({ organizationId, day, count: 1 })
    .onConflictDoUpdate({
      target: [inboundDropCounter.organizationId, inboundDropCounter.day],
      set: { count: sql`${inboundDropCounter.count} + 1`, updatedAt: now },
    });
}

function describeSender(parsed: ParsedInboundMessage | null, mailFrom: string): string {
  return parsed?.from ?? (mailFrom || "an unknown sender");
}

/**
 * Records one received message for every environment it is routed to. Throws only on
 * infrastructure failures (database, content store), so the provider notification is retried.
 */
export async function receiveEmail(
  message: InboundMessage,
  deps: InboundDeps,
): Promise<ReceiveOutcome[]> {
  const { tokens, rest } = splitDmarcReportRecipients(message.recipients, deps.managedDomain);
  let loaded: Promise<Uint8Array> | null = null;
  const loadRaw = () => {
    loaded ??= message.raw();
    return loaded;
  };
  const outcomes = await receiveRouted({ ...message, recipients: rest, raw: loadRaw }, deps);
  if (tokens.length > 0) {
    await ingestDmarcReports({ ...message, raw: loadRaw }, tokens, {
      managedDomain: deps.managedDomain,
      quota: deps.dmarcQuota,
    });
  }
  return outcomes;
}

async function receiveRouted(
  message: InboundMessage,
  deps: InboundDeps,
): Promise<ReceiveOutcome[]> {
  const routes = await routeRecipients(message.recipients, deps.managedDomain);
  if (routes.length === 0) return [];
  const blocked = message.verdicts.virus === "fail";
  const billable = isBillableReceipt(message);
  let raw: Uint8Array | null = null;
  let parsed: ParsedInboundMessage | null = null;
  const outcomes: ReceiveOutcome[] = [];

  for (const route of routes) {
    const existing = await findExisting(route, message);
    if (existing) {
      outcomes.push({
        kind: "duplicate",
        environmentId: route.environmentId,
        receivedEmailId: existing,
        recipients: route.recipients,
      });
      continue;
    }
    if (
      deps.quota &&
      !(await deps.quota.consume(
        route.organizationId,
        JSON.stringify([route.environmentId, message.provider, message.providerMessageId]),
      ))
    ) {
      await countDrop(route.organizationId, message.receivedAt);
      outcomes.push({
        kind: "over_limit",
        environmentId: route.environmentId,
        recipients: route.recipients,
      });
      continue;
    }
    raw ??= await message.raw();
    const dataMegabytes = billableEmailMegabytes(raw.byteLength);
    // A virus verdict stores no content and isn't billed: nothing for this limit to bound.
    if (
      deps.dataQuota &&
      !blocked &&
      dataMegabytes > 0 &&
      !(await deps.dataQuota.consume(
        route.organizationId,
        JSON.stringify([route.environmentId, message.provider, message.providerMessageId]),
        dataMegabytes,
      ))
    ) {
      await countDrop(route.organizationId, message.receivedAt);
      outcomes.push({
        kind: "over_limit",
        environmentId: route.environmentId,
        recipients: route.recipients,
      });
      continue;
    }
    parsed ??= await parseInboundMessage(raw);
    const id = newId(ID_PREFIXES.receivedEmail);
    const prefix = receivedEmailPrefix({
      organizationId: route.organizationId,
      environmentId: route.environmentId,
      receivedEmailId: id,
    });
    const attachments = blocked
      ? []
      : parsed.attachments.map((attachment, position) => {
          const attachmentId = newId(ID_PREFIXES.receivedEmailAttachment);
          return { ...attachment, id: attachmentId, position, key: `${prefix}att/${attachmentId}` };
        });
    const rawKey = blocked ? null : `${prefix}raw.eml`;
    const written: string[] = [];
    if (rawKey) {
      await deps.store.put({
        key: rawKey,
        organizationId: route.organizationId,
        contentType: "message/rfc822",
        content: scrubEnvelopeHeaders(raw, route.recipients),
      });
      written.push(rawKey);
      for (const attachment of attachments) {
        await deps.store.put({
          key: attachment.key,
          organizationId: route.organizationId,
          contentType: attachment.contentType,
          content: attachment.content,
        });
        written.push(attachment.key);
      }
    }

    const content = blocked ? null : parsed;
    let insertedId: string | null;
    try {
      insertedId = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(receivedEmail)
          .values({
            id,
            organizationId: route.organizationId,
            projectId: route.projectId,
            environmentId: route.environmentId,
            status: blocked ? "blocked" : "received",
            blockedReason: blocked ? "virus" : null,
            provider: message.provider,
            providerMessageId: message.providerMessageId,
            mailFrom: message.mailFrom,
            recipients: route.recipients,
            from: parsed?.from ?? null,
            to: parsed?.to ?? [],
            cc: content?.cc ?? [],
            replyTo: content?.replyTo ?? [],
            subject: parsed?.subject ?? null,
            messageId: parsed?.messageId ?? null,
            inReplyTo: content?.inReplyTo ?? null,
            references: content?.references ?? [],
            sentAt: content?.sentAt ?? null,
            headers: content ? scrubParsedHeaders(content.headers, route.recipients) : [],
            text: content?.text ?? null,
            html: content?.html ?? null,
            truncated: content?.truncated ?? false,
            spamVerdict: message.verdicts.spam,
            virusVerdict: message.verdicts.virus,
            spfVerdict: message.verdicts.spf,
            dkimVerdict: message.verdicts.dkim,
            dmarcVerdict: message.verdicts.dmarc,
            dmarcPolicy: message.verdicts.dmarcPolicy,
            size: raw?.byteLength ?? 0,
            rawKey,
            receivedAt: message.receivedAt,
          })
          .onConflictDoNothing()
          .returning({ id: receivedEmail.id });
        if (!inserted) return null;
        if (billable) {
          // Throws past a capped plan's allowance, rolling the copy back with it.
          await deps.billing?.reserve(tx, {
            organizationId: route.organizationId,
            meter: "email.received",
            quantity: 1,
          });
          await recordUsage(tx, {
            organizationId: route.organizationId,
            environmentId: route.environmentId,
            projectId: route.projectId,
            meter: "email.received",
            quantity: 1,
          });
          await deps.billing?.reserve(tx, {
            organizationId: route.organizationId,
            meter: "email.received_data",
            quantity: dataMegabytes,
          });
          await recordUsage(tx, {
            organizationId: route.organizationId,
            environmentId: route.environmentId,
            projectId: route.projectId,
            meter: "email.received_data",
            quantity: dataMegabytes,
          });
        }
        if (attachments.length > 0) {
          await tx.insert(receivedEmailAttachment).values(
            attachments.map((attachment) => ({
              id: attachment.id,
              organizationId: route.organizationId,
              receivedEmailId: id,
              position: attachment.position,
              filename: attachment.filename,
              contentType: attachment.contentType,
              contentId: attachment.contentId,
              disposition: attachment.disposition,
              size: attachment.size,
              sha256: attachment.sha256,
              contentKey: attachment.key,
            })),
          );
        }
        const sender = describeSender(parsed, message.mailFrom);
        await appendLogEntries(tx, [
          {
            organizationId: route.organizationId,
            projectId: route.projectId,
            environmentId: route.environmentId,
            occurredAt: message.receivedAt,
            source: "email",
            level: blocked ? "warning" : "info",
            type: "email.received",
            message: blocked
              ? `Blocked a message with a virus from ${sender}`
              : `Received from ${sender}`,
            errorCode: blocked ? "virus" : null,
            resourceType: "received_email",
            resourceId: id,
            recipient: route.recipients.length === 1 ? (route.recipients[0] ?? null) : null,
            attributes: {
              provider: message.provider,
              provider_message_id: message.providerMessageId,
              recipients: route.recipients,
              size: raw?.byteLength ?? 0,
              spam_verdict: message.verdicts.spam,
              virus_verdict: message.verdicts.virus,
            },
          },
        ]);
        if (!blocked) {
          const payload: StoredReceivedEmailWebhookEvent = {
            id: newId(ID_PREFIXES.webhookEvent),
            object: "event",
            type: "email.received",
            created_at: new Date().toISOString(),
            data: {
              received_email_id: id,
              from: parsed?.from ?? null,
              to: parsed?.to ?? [],
              recipients: route.recipients,
              subject: parsed?.subject ?? null,
              message_id: parsed?.messageId ?? null,
              attachment_count: attachments.length,
              size: raw?.byteLength ?? 0,
              spam: message.verdicts.spam === "fail",
              verdicts: {
                spam: message.verdicts.spam,
                virus: message.verdicts.virus,
                spf: message.verdicts.spf,
                dkim: message.verdicts.dkim,
                dmarc: message.verdicts.dmarc,
                dmarc_policy: message.verdicts.dmarcPolicy,
              },
              sandbox: route.mode === "sandbox",
              received_at: message.receivedAt.toISOString(),
            },
          };
          await enqueueWebhookMessage(tx, {
            id: payload.id,
            organizationId: route.organizationId,
            environmentId: route.environmentId,
            type: payload.type,
            payload,
          });
          // Inboxes among the recipients get it in a thread (and their own webhook).
          await recordInboundInboxMessages(tx, {
            organizationId: route.organizationId,
            environmentId: route.environmentId,
            sandbox: route.mode === "sandbox",
            receivedEmailId: id,
            recipients: route.recipients,
            from: parsed?.from ?? null,
            to: parsed?.to ?? [],
            cc: content?.cc ?? [],
            subject: parsed?.subject ?? null,
            messageId: parsed?.messageId ?? null,
            inReplyTo: content?.inReplyTo ?? null,
            references: content?.references ?? [],
            attachmentCount: attachments.length,
            spam: message.verdicts.spam === "fail",
            receivedAt: message.receivedAt,
          });
        }
        return inserted.id;
      });
    } catch (error) {
      if (!isAllowanceRefusal(error)) throw error;
      await deps.store.delete(written);
      await countDrop(route.organizationId, message.receivedAt);
      outcomes.push({
        kind: "over_limit",
        environmentId: route.environmentId,
        recipients: route.recipients,
      });
      continue;
    }

    if (!insertedId) {
      // A concurrent notification for the same message won: drop this copy's content.
      await deps.store.delete(written);
      const winner = await findExisting(route, message);
      outcomes.push({
        kind: "duplicate",
        environmentId: route.environmentId,
        receivedEmailId: winner ?? id,
        recipients: route.recipients,
      });
      continue;
    }
    outcomes.push({
      kind: blocked ? "blocked" : "received",
      environmentId: route.environmentId,
      receivedEmailId: insertedId,
      recipients: route.recipients,
    });
  }
  return outcomes;
}

/** Subject markers that set the fake provider's verdicts (the simulator, tests). */
export function fakeVerdicts(subject: string): InboundVerdicts {
  const marked = (name: string) => subject.includes(`[coss-test:${name}]`);
  return {
    spam: marked("spam") ? "fail" : "pass",
    virus: marked("virus") ? "fail" : "pass",
    spf: marked("spf-fail") ? "fail" : "pass",
    dkim: marked("dkim-fail") ? "fail" : "pass",
    dmarc: marked("dmarc-fail") ? "fail" : "pass",
    dmarcPolicy: marked("dmarc-fail") ? "reject" : null,
  };
}

/**
 * Receives `raw` through the fake provider, as if it arrived for `recipients` (the dashboard's
 * simulator in development, tests). Verdicts come from the subject's markers.
 */
export async function receiveFakeEmail(
  input: {
    raw: Uint8Array;
    mailFrom: string;
    recipients: readonly string[];
    subject: string;
    receivedAt?: Date;
  },
  deps: InboundDeps,
): Promise<ReceiveOutcome[]> {
  return receiveEmail(
    {
      provider: "fake",
      providerMessageId: `fake-${randomBytes(12).toString("hex")}`,
      mailFrom: input.mailFrom,
      recipients: input.recipients,
      raw: async () => input.raw,
      verdicts: fakeVerdicts(input.subject),
      receivedAt: input.receivedAt ?? new Date(),
    },
    deps,
  );
}
