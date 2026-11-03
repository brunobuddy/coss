/**
 * Wire schemas of test webhook events (`POST /v1/webhook_events/test`, `coss trigger`). Plain zod,
 * no database imports: `@coss/email/test-event-schemas` is safe to load anywhere.
 */
import { BILLING_EVENT_TYPES } from "@coss/billing/wire";
import { FORM_WEBHOOK_EVENT_TYPES, FormSubmissionWebhookEvent } from "@coss/forms/schemas";
import { ACCOUNT_EVENT_TYPES } from "@coss/reputation/schemas";
import { RISK_EVENT_TYPES, RiskWebhookEvent } from "@coss/risk/schemas";
import {
  SCHEDULING_BOOKING_EVENT_TYPES,
  SCHEDULING_WEBHOOK_EVENT_TYPES,
  SchedulingBookingWebhookEvent,
  SchedulingCalendarWebhookEvent,
} from "@coss/scheduling/schemas";
import { SIGN_WEBHOOK_EVENT_TYPES, SignRequestWebhookEvent } from "@coss/sign/schemas";
import {
  RECEIVED_SMS_EVENT_TYPES,
  ReceivedSmsWebhookEvent,
  SMS_EVENT_TYPES,
  SmsWebhookEvent,
} from "@coss/sms/schemas";
import { VERIFY_WEBHOOK_EVENT_TYPES, VerificationWebhookEvent } from "@coss/verify/schemas";
import { LATEST_API_VERSION } from "@coss/versioning";
import { HOOK_OPERATIONAL_EVENT_TYPES, HookEndpointWebhookEvent } from "@coss/webhooks/schemas";
import { z } from "zod";
import { BroadcastWebhookEvent } from "./broadcast-schemas.ts";
import {
  BROADCAST_EVENT_TYPES,
  CONTACT_EVENT_TYPES,
  INBOX_EVENT_TYPES,
} from "./contact-event-types.ts";
import { ContactWebhookEvent } from "./contact-schemas.ts";
import { InboxMessageReceivedWebhookEvent } from "./inbox-schemas.ts";
import {
  DOMAIN_EVENT_TYPES,
  EMAIL_EVENT_TYPES,
  EmailWebhookEvent,
  RECEIVED_EMAIL_EVENT_TYPES,
  ReceivedEmailWebhookEvent,
  WEBHOOK_EVENT_TYPES,
} from "./schemas.ts";
import { SUBACCOUNT_EVENT_TYPES } from "./subaccount-schemas.ts";

/** Event types only live environments receive, so a sandbox environment has no test events of them. */
export const LIVE_ONLY_WEBHOOK_EVENT_TYPES = [
  ...DOMAIN_EVENT_TYPES,
  ...ACCOUNT_EVENT_TYPES,
  ...SUBACCOUNT_EVENT_TYPES,
  ...BILLING_EVENT_TYPES,
] as const;

/** Every other webhook event type: what `POST /v1/webhook_events/test` can send. */
export const TEST_WEBHOOK_EVENT_TYPES = [
  ...EMAIL_EVENT_TYPES,
  ...RECEIVED_EMAIL_EVENT_TYPES,
  ...HOOK_OPERATIONAL_EVENT_TYPES,
  ...RISK_EVENT_TYPES,
  ...CONTACT_EVENT_TYPES,
  ...BROADCAST_EVENT_TYPES,
  ...INBOX_EVENT_TYPES,
  ...SMS_EVENT_TYPES,
  ...RECEIVED_SMS_EVENT_TYPES,
  ...SIGN_WEBHOOK_EVENT_TYPES,
  ...VERIFY_WEBHOOK_EVENT_TYPES,
  ...FORM_WEBHOOK_EVENT_TYPES,
  ...SCHEDULING_WEBHOOK_EVENT_TYPES,
] as const;

export type TestWebhookEventType = (typeof TEST_WEBHOOK_EVENT_TYPES)[number];

/** The schema of each event type's body (the one its webhook requests are documented with). */
export function webhookEventSchema(type: TestWebhookEventType): z.ZodType {
  if (type === "email.received") return ReceivedEmailWebhookEvent;
  if ((SCHEDULING_BOOKING_EVENT_TYPES as readonly string[]).includes(type)) {
    return SchedulingBookingWebhookEvent;
  }
  if (type.startsWith("scheduling.")) return SchedulingCalendarWebhookEvent;
  if (type.startsWith("email.")) return EmailWebhookEvent;
  if (type.startsWith("hook_endpoint.")) return HookEndpointWebhookEvent;
  if (type.startsWith("risk.")) return RiskWebhookEvent;
  if (type.startsWith("contact.")) return ContactWebhookEvent;
  if (type.startsWith("inbox.")) return InboxMessageReceivedWebhookEvent;
  if ((RECEIVED_SMS_EVENT_TYPES as readonly string[]).includes(type)) {
    return ReceivedSmsWebhookEvent;
  }
  if (type.startsWith("sms.")) return SmsWebhookEvent;
  if (type.startsWith("sign_request.")) return SignRequestWebhookEvent;
  if (type.startsWith("verification.")) return VerificationWebhookEvent;
  if (type.startsWith("form.")) return FormSubmissionWebhookEvent;
  return BroadcastWebhookEvent;
}

export const CreateTestWebhookEventRequest = z
  .strictObject({
    type: z.enum(WEBHOOK_EVENT_TYPES).meta({
      description:
        "The event type. `domain.*`, `account.*`, `subaccount.*` and `billing.*` events only reach live " +
        "environments, so they can't be tested in a sandbox one.",
    }),
    data: z
      .record(z.string(), z.unknown())
      .optional()
      .meta({
        description:
          "Fields merged over the sample's `data` (objects field by field, anything else " +
          "replaced), in the latest API version's shape: e.g. a real `email_id`, or the " +
          "`recipient` your handler looks for. Unknown fields are refused.",
      }),
  })
  .meta({
    id: "CreateTestWebhookEventRequest",
    examples: [{ type: "email.bounced", data: { recipient: "ada@example.com" } }],
  });

export type CreateTestWebhookEventRequestOutput = z.output<typeof CreateTestWebhookEventRequest>;

const EMAIL_EVENT_EXAMPLE = {
  id: "evt_01k7c8m4r0c2b8w9y3d5f6g7h8",
  object: "event",
  type: "email.bounced",
  api_version: LATEST_API_VERSION,
  created_at: "2026-10-10T12:00:03.000Z",
  data: {
    email_id: "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
    from: "Acme <onboarding@acme.com>",
    to: ["ada@example.com"],
    subject: "Welcome to Acme",
    tags: [{ name: "template", value: "welcome" }],
    category: "onboarding",
    sandbox: true,
    recipient: "ada@example.com",
    occurred_at: "2026-10-10T12:00:03.000Z",
    bounce: {
      type: "permanent",
      sub_type: "General",
      diagnostic_code: "smtp; 550 5.1.1 The email account that you tried to reach does not exist",
    },
  },
};

export const WebhookTestEventObject = z
  .object({
    object: z.literal("webhook_test_event"),
    event: z
      .union([
        EmailWebhookEvent,
        ReceivedEmailWebhookEvent,
        HookEndpointWebhookEvent,
        RiskWebhookEvent,
        ContactWebhookEvent,
        BroadcastWebhookEvent,
        InboxMessageReceivedWebhookEvent,
        SmsWebhookEvent,
        ReceivedSmsWebhookEvent,
        SignRequestWebhookEvent,
        VerificationWebhookEvent,
        FormSubmissionWebhookEvent,
        SchedulingBookingWebhookEvent,
        SchedulingCalendarWebhookEvent,
      ])
      .meta({
        description:
          "The event, as an endpoint on the request's API version receives it. Its `webhook-id` " +
          "header is `event.id`.",
      }),
    endpoints: z.int().meta({
      description:
        "Enabled endpoints of the environment subscribed to the type, each sent it once.",
    }),
    listeners: z.int().meta({
      description: "Open `coss listen` listeners subscribed to the type, each handed it once.",
    }),
  })
  .meta({
    id: "WebhookTestEvent",
    examples: [
      { object: "webhook_test_event", event: EMAIL_EVENT_EXAMPLE, endpoints: 1, listeners: 1 },
    ],
  });

export type WebhookTestEventOutput = z.output<typeof WebhookTestEventObject>;
