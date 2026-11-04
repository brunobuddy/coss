/**
 * Test webhook events (`POST /v1/webhook_events/test`, `coss trigger`): a sample event of any type a
 * sandbox environment can receive, sent like a real one (the outbox, in a transaction) to its
 * subscribed endpoints and open `coss listen` listeners.
 *
 * The body is exactly a real event's, with no marker: a handler should take it the way it takes
 * the real thing. Only sandbox environments send them, and the ids in the sample are made up
 * (handlers that look objects up get 404s unless `data` names real ones).
 */
import { db } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { REASONS } from "@coss/risk/schemas";
import { LATEST_API_VERSION } from "@coss/versioning";
import { fanOutWebhookMessage } from "@coss/webhooks";
import type { z } from "zod";
import { EmailError } from "./errors.ts";
import {
  LIVE_ONLY_WEBHOOK_EVENT_TYPES,
  TEST_WEBHOOK_EVENT_TYPES,
  type TestWebhookEventType,
  webhookEventSchema,
} from "./test-event-schemas.ts";

type Data = Record<string, unknown>;
/** A webhook event body as the outbox stores it (no `api_version`: delivery adds it). */
export type StoredTestWebhookEvent = {
  id: string;
  object: "event";
  type: TestWebhookEventType;
  created_at: string;
  data: Data;
};

function isPlainObject(value: unknown): value is Data {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `patch` over `base`: objects field by field, anything else replaced. */
function merge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out: Data = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = merge(base[key], value);
  return out;
}

/**
 * Fields of `patch` the parsed event dropped: not part of the type's schema (typos, mostly), in
 * objects and in the objects of lists (`tags.0.typo`; lists replace the sample's, so indexes match).
 */
function unknownFields(patch: unknown, parsed: unknown, path: string): string[] {
  if (Array.isArray(patch)) {
    if (!Array.isArray(parsed)) return [];
    return patch.flatMap((item, index) => unknownFields(item, parsed[index], `${path}.${index}`));
  }
  if (!isPlainObject(patch) || !isPlainObject(parsed)) return [];
  return Object.entries(patch).flatMap(([key, value]) =>
    key in parsed ? unknownFields(value, parsed[key], `${path}.${key}`) : [`${path}.${key}`],
  );
}

/** The first example of the schema (the API reference's): the sample's starting point. */
function exampleData(type: TestWebhookEventType): Data {
  const meta = webhookEventSchema(type).meta() as { examples?: { data?: Data }[] } | undefined;
  return structuredClone(meta?.examples?.[0]?.data ?? {});
}

/** What an event of each email type adds to the email's description. */
function emailDetails(type: string, now: string): Data {
  switch (type) {
    case "email.delivered":
      return { delivery: { smtp_response: "250 2.0.0 OK" } };
    case "email.delivery_delayed":
      return {
        delay: {
          type: "MailboxFull",
          expires_at: new Date(Date.parse(now) + 86_400_000).toISOString(),
          diagnostic_code:
            "smtp; 452 4.2.2 The email account that you tried to reach is over quota",
        },
      };
    case "email.bounced":
      return {
        bounce: {
          type: "permanent",
          sub_type: "General",
          diagnostic_code:
            "smtp; 550 5.1.1 The email account that you tried to reach does not exist",
        },
      };
    case "email.complained":
      return { complaint: { feedback_type: "abuse", sub_type: null } };
    case "email.failed":
      return { failure: { code: "dispatch_failed", message: "The email could not be sent." } };
    case "email.suppressed":
      return {
        suppression: { id: newId(ID_PREFIXES.emailSuppression), scope: "*", reason: "bounce" },
      };
    case "email.opened":
      return { open: { user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } };
    case "email.clicked":
      return {
        click: {
          url: "https://acme.com/welcome",
          link_position: 0,
          user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
      };
    case "email.rescheduled":
      return {
        reschedule: {
          scheduled_at: new Date(Date.parse(now) + 2 * 3_600_000).toISOString(),
          previous_scheduled_at: new Date(Date.parse(now) + 3_600_000).toISOString(),
        },
      };
    default:
      return {};
  }
}

/** Email events about the whole email rather than one recipient. */
const WHOLE_EMAIL = new Set([
  "email.sent",
  "email.failed",
  "email.scheduled",
  "email.canceled",
  "email.rescheduled",
]);

const BROADCAST_STATUS_BY_TYPE: Record<string, string> = {
  "broadcast.sending": "sending",
  "broadcast.sent": "sent",
  "broadcast.paused": "paused",
  "broadcast.canceled": "canceled",
  "broadcast.failed": "failed",
};

/** What an event of each `sms.*` type about a sent message adds to its description. */
function smsDetails(type: string): Data {
  switch (type) {
    case "sms.failed":
      return {
        failure: {
          code: "invalid_number",
          message: "The number can't receive SMS (it doesn't exist, or isn't a mobile number).",
        },
        provider_error_code: "21211",
      };
    case "sms.undelivered":
      return {
        failure: {
          code: "carrier_filtered",
          message: "The carrier filtered the message as spam or unregistered traffic.",
        },
        provider_error_code: "30007",
      };
    case "sms.suppressed":
      return { suppression: { id: newId(ID_PREFIXES.smsSuppression), reason: "opt_out" } };
    default:
      return {};
  }
}

const SMS_KEYWORD_BY_TYPE: Record<string, string> = {
  "sms.opted_out": "stop",
  "sms.opted_in": "start",
};

/** Each `sign_request.*` sample's request status and, when the event is a signer's, theirs. */
const SIGN_SAMPLE_BY_TYPE: Record<string, { status: string; signer: string | null }> = {
  "sign_request.sent": { status: "sent", signer: null },
  "sign_request.viewed": { status: "sent", signer: "viewed" },
  "sign_request.signer_signed": { status: "sent", signer: "signed" },
  "sign_request.declined": { status: "declined", signer: "declined" },
  "sign_request.completed": { status: "completed", signer: null },
  "sign_request.canceled": { status: "canceled", signer: null },
  "sign_request.expired": { status: "expired", signer: null },
};

/** A realistic sample of `type` at `now`, with fresh ids. */
export function sampleWebhookEvent(type: TestWebhookEventType, now: Date): StoredTestWebhookEvent {
  const at = now.toISOString();
  const base = exampleData(type);
  let data: Data;
  if (type === "email.received") {
    data = {
      ...base,
      received_email_id: newId(ID_PREFIXES.receivedEmail),
      sandbox: true,
      received_at: at,
    };
  } else if (type.startsWith("email.")) {
    // The example is a delivery: keep the email's description, not its details.
    const { delivery: _delivery, ...email } = base;
    const recipient =
      Array.isArray(email.to) && typeof email.to[0] === "string" ? email.to[0] : "user@example.com";
    data = {
      ...email,
      email_id: newId(ID_PREFIXES.email),
      sandbox: true,
      recipient: WHOLE_EMAIL.has(type) ? null : recipient,
      occurred_at: at,
      ...emailDetails(type, at),
    };
  } else if (type.startsWith("inbox.")) {
    data = {
      ...base,
      inbox_id: newId(ID_PREFIXES.inbox),
      thread_id: newId(ID_PREFIXES.inboxThread),
      message_id: newId(ID_PREFIXES.inboxMessage),
      received_email_id: newId(ID_PREFIXES.receivedEmail),
      sandbox: true,
      received_at: at,
    };
  } else if (type.startsWith("hook_endpoint.")) {
    data = {
      ...base,
      application_id: newId(ID_PREFIXES.hookApplication),
      endpoint_id: newId(ID_PREFIXES.hookEndpoint),
      failing_since: new Date(now.getTime() - 5 * 86_400_000).toISOString(),
      occurred_at: at,
    };
  } else if (type.startsWith("risk.")) {
    data = {
      assessment_id: newId(ID_PREFIXES.riskAssessment),
      event: "signup",
      event_name: null,
      decision: "review",
      score: 0.62,
      reasons: [{ code: "email.disposable", message: REASONS["email.disposable"].description }],
      user_id: "user_8812",
      outcome: type === "risk.assessment.reviewed" ? "legitimate" : null,
      occurred_at: at,
    };
  } else if (type.startsWith("contact.")) {
    const contact = isPlainObject(base.contact) ? base.contact : {};
    data = {
      ...base,
      contact: {
        ...contact,
        id: newId(ID_PREFIXES.contact),
        status: type === "contact.unsubscribed" ? "unsubscribed" : "subscribed",
      },
      source:
        type === "contact.unsubscribed" || type === "contact.confirmed"
          ? "preference_center"
          : "api",
      occurred_at: at,
    };
  } else if (type in SMS_KEYWORD_BY_TYPE || type === "sms.received") {
    data = {
      ...base,
      received_sms_id: newId(ID_PREFIXES.smsReceived),
      keyword: SMS_KEYWORD_BY_TYPE[type] ?? null,
      sandbox: true,
      occurred_at: at,
    };
  } else if (type.startsWith("sign_request.")) {
    const signer = isPlainObject(base.signer) ? base.signer : {};
    const byType = SIGN_SAMPLE_BY_TYPE[type] ?? { status: "sent", signer: null };
    data = {
      ...base,
      sign_request_id: newId(ID_PREFIXES.signRequest),
      status: byType.status,
      signer: byType.signer
        ? { ...signer, id: newId(ID_PREFIXES.signSigner), status: byType.signer }
        : null,
      reason: type === "sign_request.declined" ? "The amount is wrong." : null,
      sandbox: true,
      occurred_at: at,
    };
  } else if (type.startsWith("verification.")) {
    const failed = type === "verification.failed";
    const blocked = type === "verification.blocked";
    data = {
      ...base,
      verification_id: newId(ID_PREFIXES.verifyRequest),
      status: failed ? "failed" : blocked ? "blocked" : "approved",
      failure: failed
        ? { code: "max_attempts", message: "Too many wrong codes were checked." }
        : null,
      reasons: blocked ? [{ code: "verify.prefix_velocity", value: 42 }] : [],
      sandbox: true,
      occurred_at: at,
    };
  } else if (type.startsWith("scheduling.booking.")) {
    data = {
      ...base,
      booking_id: newId(ID_PREFIXES.schedulingBooking),
      event_type_id: newId(ID_PREFIXES.schedulingEventType),
      host_ids: [newId(ID_PREFIXES.schedulingHost)],
      occurred_at: at,
    };
  } else if (type.startsWith("scheduling.calendar_delegation.")) {
    data = {
      ...base,
      delegation_id: newId(ID_PREFIXES.schedulingCalendarDelegation),
      provider: "google",
      domain: "example.com",
      code: type.endsWith(".failing") ? "unauthorized_client" : null,
      occurred_at: at,
    };
  } else if (type.startsWith("scheduling.calendar.")) {
    data = {
      ...base,
      host_id: newId(ID_PREFIXES.schedulingHost),
      connection_id: newId(ID_PREFIXES.schedulingCalendarConnection),
      occurred_at: at,
    };
  } else if (type.startsWith("scheduling.reassignment.")) {
    data = {
      ...base,
      reassignment_id: newId(ID_PREFIXES.schedulingReassignment),
      status: "completed",
      out_of_office_id: null,
      counts: {
        total: 3,
        pending: 0,
        reassigned: 2,
        skipped: 0,
        no_candidate: 1,
        failed: 0,
        cancelled: 0,
      },
      occurred_at: at,
    };
  } else if (type.startsWith("scheduling.out_of_office.")) {
    data = {
      ...base,
      out_of_office_id: newId(ID_PREFIXES.schedulingOutOfOffice),
      host_id: newId(ID_PREFIXES.schedulingHost),
      group: null,
      occurred_at: at,
    };
  } else if (type.startsWith("form.")) {
    const flagged = type === "form.submission.flagged";
    data = {
      ...base,
      form_id: newId(ID_PREFIXES.form),
      submission_id: newId(ID_PREFIXES.formSubmission),
      status: flagged ? "held" : "accepted",
      spam_reason: flagged ? "risk_review" : null,
      sandbox: true,
      occurred_at: at,
    };
  } else if (type.startsWith("sms.")) {
    data = {
      ...base,
      sms_id: newId(ID_PREFIXES.smsMessage),
      sandbox: true,
      occurred_at: at,
      ...smsDetails(type),
    };
  } else {
    const broadcast = isPlainObject(base.broadcast) ? base.broadcast : {};
    data = {
      ...base,
      broadcast: {
        ...broadcast,
        id: newId(ID_PREFIXES.broadcast),
        status: BROADCAST_STATUS_BY_TYPE[type] ?? "sent",
      },
      pause_reason: type === "broadcast.paused" ? "paused" : null,
      error:
        type === "broadcast.failed"
          ? { code: "render_failed", message: "The broadcast's template could not be rendered." }
          : null,
      occurred_at: at,
    };
  }
  return { id: newId(ID_PREFIXES.webhookEvent), object: "event", type, created_at: at, data };
}

function isTestable(type: string): type is TestWebhookEventType {
  return (TEST_WEBHOOK_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * Sends a test event of `type` (a sample, with `data` merged over it) to the environment's
 * subscribed endpoints and listeners. Refused for live environments (`sandbox_only`), live-only
 * types (`live_only_event_type`) and a `data` that doesn't fit the type (`invalid_test_event`).
 */
export async function sendTestWebhookEvent(input: {
  organizationId: string;
  environmentId: string;
  mode: "live" | "sandbox";
  type: string;
  data?: Data;
  now?: Date;
}): Promise<{ event: StoredTestWebhookEvent; endpoints: number; listeners: number }> {
  if (input.mode !== "sandbox") {
    throw new EmailError(
      "sandbox_only",
      "Test events are sent only in sandbox environments: use a development (coss_test_…) key.",
    );
  }
  if (!isTestable(input.type)) {
    const liveOnly = (LIVE_ONLY_WEBHOOK_EVENT_TYPES as readonly string[]).includes(input.type);
    throw new EmailError(
      "live_only_event_type",
      liveOnly
        ? `${input.type} events only reach live environments, so a sandbox environment has no test events of them.`
        : `Unknown event type "${input.type}".`,
    );
  }
  const sample = sampleWebhookEvent(input.type, input.now ?? new Date());
  const event: StoredTestWebhookEvent = {
    ...sample,
    data: input.data ? (merge(sample.data, input.data) as Data) : sample.data,
  };
  const parsed = (webhookEventSchema(input.type) as z.ZodType).safeParse({
    ...event,
    api_version: LATEST_API_VERSION,
  });
  const issues = parsed.success
    ? unknownFields(input.data ?? {}, (parsed.data as { data?: unknown }).data, "data").map(
        (path) => ({ path, message: `Not a field of ${input.type} events.` }),
      )
    : parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
  if (issues.length > 0) {
    throw new EmailError("invalid_test_event", `This isn't a valid ${input.type} event.`, {
      param: "data",
      issues,
    });
  }
  const counts = await db.transaction((tx) =>
    fanOutWebhookMessage(tx, {
      id: event.id,
      organizationId: input.organizationId,
      environmentId: input.environmentId,
      type: event.type,
      payload: event,
      now: input.now,
    }),
  );
  return { event, ...counts };
}
