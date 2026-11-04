/**
 * Consumes SES receipt notifications (receipt rule → S3 + SNS → SQS): loads the raw message SES
 * wrote under `landing/`, records it for every environment its envelope recipients route to, then
 * deletes the landing object. A message is deleted from the queue only after that; anything that
 * fails stays, is retried after the visibility timeout and lands in the dead-letter queue after 5
 * receives (the landing object outlives the DLQ, see `ses:bootstrap`).
 */
import {
  type InboundDataQuota,
  type InboundDeps,
  type InboundQuota,
  receiveEmail,
} from "@coss/email";
import { parseSesReceipt, type S3Api } from "@coss/email/ses";
import type { RateLimiter } from "@coss/ratelimit";
import type { QueueMessage, SqsApi } from "./sqs.ts";

export type SesInboundDeps = {
  sqs: SqsApi;
  s3: S3Api;
  /** The inbound bucket (`SES_INBOUND_BUCKET`): notifications naming another one are ignored. */
  bucket: string;
  inbound: InboundDeps;
};

/** The daily per-organization limit (`email.inbound.day`), charged once per environment. */
export function inboundQuota(limiter: RateLimiter): InboundQuota {
  return {
    async consume(organizationId, messageKey) {
      const decision = await limiter.consume({
        buckets: ["email.inbound.day"],
        subject: organizationId,
        organizationId,
        // Outlive the source queue and DLQ: retries reuse admission even after a worker crash.
        idempotency: { key: messageKey, ttlMs: 21 * 24 * 60 * 60 * 1000 },
      });
      return decision.allowed;
    },
  };
}

/** The daily per-organization limit of received data (`email.inbound.megabytes.day`). */
export function inboundDataQuota(limiter: RateLimiter): InboundDataQuota {
  return {
    async consume(organizationId, messageKey, megabytes) {
      const decision = await limiter.consume({
        buckets: ["email.inbound.megabytes.day"],
        subject: organizationId,
        organizationId,
        cost: megabytes,
        // As for `email.inbound.day`: retries reuse admission.
        idempotency: { key: messageKey, ttlMs: 21 * 24 * 60 * 60 * 1000 },
      });
      return decision.allowed;
    },
  };
}

/**
 * Each organization's daily DMARC report budget (`email.dmarc_reports.day`), charged once per
 * domain and report message.
 */
export function dmarcReportQuota(limiter: RateLimiter): InboundQuota {
  return {
    async consume(organizationId, messageKey) {
      const decision = await limiter.consume({
        buckets: ["email.dmarc_reports.day"],
        subject: organizationId,
        organizationId,
        idempotency: { key: messageKey, ttlMs: 21 * 24 * 60 * 60 * 1000 },
      });
      return decision.allowed;
    },
  };
}

/** Records one notification; true when it can be deleted (recorded, duplicate or irrelevant). */
export async function handleSesReceipt(body: string, deps: SesInboundDeps): Promise<boolean> {
  let parsed: ReturnType<typeof parseSesReceipt>;
  try {
    parsed = parseSesReceipt(body);
  } catch (error) {
    console.error("[worker:ses-inbound] unparseable message:", error);
    return false;
  }
  if (parsed.kind === "ignored") return true;
  const { receipt } = parsed;
  if (receipt.bucketName !== deps.bucket) {
    console.error(
      `[worker:ses-inbound] ${receipt.messageId} is in bucket ${receipt.bucketName}, not ${deps.bucket}; ignored.`,
    );
    return true;
  }
  let raw: Uint8Array | null = null;
  await receiveEmail(
    {
      provider: "ses",
      providerMessageId: receipt.messageId,
      mailFrom: receipt.source,
      recipients: receipt.recipients,
      raw: async () => {
        raw ??= await deps.s3.getObject(deps.bucket, receipt.objectKey);
        if (!raw) throw new MissingLandingObject(receipt.objectKey);
        return raw;
      },
      verdicts: receipt.verdicts,
      receivedAt: receipt.timestamp,
    },
    deps.inbound,
  ).catch((error: unknown) => {
    // Already recorded and cleaned up by an earlier delivery of this notification, or expired.
    if (error instanceof MissingLandingObject) {
      console.warn(`[worker:ses-inbound] ${error.message}; nothing left to record.`);
      return [];
    }
    throw error;
  });
  await deps.s3.deleteObject(deps.bucket, receipt.objectKey);
  return true;
}

class MissingLandingObject extends Error {
  constructor(key: string) {
    super(`landing object ${key} is gone`);
    this.name = "MissingLandingObject";
  }
}

/** One receive → record → delete round. Returns how many messages were received. */
export async function pollSesInbound(
  deps: SesInboundDeps,
  opts: { signal?: AbortSignal } = {},
): Promise<number> {
  const messages = await deps.sqs.receive(opts.signal);
  const done: QueueMessage[] = [];
  // One at a time: a message can be 40 MB.
  for (const message of messages) {
    try {
      if (await handleSesReceipt(message.body, deps)) done.push(message);
    } catch (error) {
      console.error(`[worker:ses-inbound] recording ${message.id} failed:`, error);
    }
  }
  await deps.sqs.delete(done);
  return messages.length;
}
