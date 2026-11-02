import { BillingWebhookEvent } from "@coss/billing/wire";
import { BroadcastWebhookEvent } from "@coss/email/broadcast-schemas";
import { ContactWebhookEvent } from "@coss/email/contact-schemas";
import {
  DomainWebhookEvent,
  EmailWebhookEvent,
  ReceivedEmailWebhookEvent,
} from "@coss/email/schemas";
import { SubaccountWebhookEvent } from "@coss/email/subaccount-schemas";
import { FormSubmissionWebhookEvent } from "@coss/forms/schemas";
import { AccountWebhookEvent } from "@coss/reputation/schemas";
import { RiskWebhookEvent } from "@coss/risk/schemas";
import {
  SchedulingBookingWebhookEvent,
  SchedulingCalendarWebhookEvent,
} from "@coss/scheduling/schemas";
import { SignRequestWebhookEvent } from "@coss/sign/schemas";
import { ReceivedSmsWebhookEvent, SmsWebhookEvent } from "@coss/sms/schemas";
import { HookEndpointWebhookEvent } from "@coss/webhooks/schemas";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "./types.ts";

/**
 * The events coss.com posts to webhook endpoints. No route returns them, so they're added to the
 * document's components on their own: the generated SDKs (sdks/*) get a typed model of each.
 */
const WEBHOOK_EVENTS = {
  EmailWebhookEvent,
  ReceivedEmailWebhookEvent,
  DomainWebhookEvent,
  AccountWebhookEvent,
  SubaccountWebhookEvent,
  BillingWebhookEvent,
  RiskWebhookEvent,
  HookEndpointWebhookEvent,
  ContactWebhookEvent,
  BroadcastWebhookEvent,
  SmsWebhookEvent,
  ReceivedSmsWebhookEvent,
  SignRequestWebhookEvent,
  FormSubmissionWebhookEvent,
  SchedulingBookingWebhookEvent,
  SchedulingCalendarWebhookEvent,
};

export function registerWebhookEvents(app: OpenAPIHono<AppEnv>): void {
  // Not `registry.register(id, schema)`: it re-tags the schema with zod-to-openapi's `.openapi()`,
  // which only its CommonJS copy of zod has. The schemas already carry their id (`.meta({ id })`),
  // which is all a schema definition needs.
  const registry = app.openAPIRegistry as unknown as {
    _definitions: { type: "schema"; schema: unknown }[];
  };
  for (const schema of Object.values(WEBHOOK_EVENTS))
    registry._definitions.push({ type: "schema", schema });
}
