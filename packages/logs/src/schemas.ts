/**
 * Public wire schemas for logs (snake_case). Plain zod with `.meta({ id })`, shared by the public
 * API, its OpenAPI document and the contract tests. Must not import the database:
 * `@coss/logs/schemas` is safe to load anywhere.
 */
import { z } from "zod";

export const LOG_SOURCES = [
  "api",
  "email",
  "webhook",
  "risk",
  "smtp",
  "sms",
  "sign",
  "verify",
  "forms",
  "scheduling",
] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

/** What a log drain can forward: every log source, plus the environment's audit events. */
export const LOG_DRAIN_SOURCES = [...LOG_SOURCES, "audit"] as const;
export type LogDrainSource = (typeof LOG_DRAIN_SOURCES)[number];

export const LOG_LEVELS = ["info", "warning", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const DEFAULT_LOG_LIST_LIMIT = 50;
export const MAX_LOG_LIST_LIMIT = 100;
/** How long a range one query may cover (also the longest retention we offer). */
export const MAX_LOG_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
/** The range when a query names none. */
export const DEFAULT_LOG_RANGE_MS = 60 * 60 * 1000;

export const LogSourceEnum = z.enum(LOG_SOURCES).meta({
  id: "LogSource",
  description:
    "`api`: a request to the API. `email`: an email event. `webhook`: a delivery attempt. " +
    "`risk`: a risk assessment or its feedback. `smtp`: a message submitted to the SMTP relay. " +
    "`sms`: an SMS event.",
});

export const LogLevelEnum = z.enum(LOG_LEVELS).meta({
  id: "LogLevel",
  description:
    "`error`: 5xx responses, bounces, complaints, failures. `warning`: 4xx responses, delays, " +
    "suppressions, failed webhook attempts that will be retried. `info`: everything else.",
});

const LOG_ID_EXAMPLE = "log_01k7c8m4q2f3e9v6t5r1n0p8yz";

const LOG_EXAMPLE = {
  object: "log",
  id: LOG_ID_EXAMPLE,
  occurred_at: "2026-01-15T09:30:00.000Z",
  source: "api",
  level: "info",
  type: "api.request",
  message: "POST /v1/emails 202",
  request_id: "req_01k7c8m4q2f3e9v6t5r1n0p8yz",
  api_key_id: "key_01k7c8m4q2f3e9v6t5r1n0p8yz",
  method: "POST",
  path: "/v1/emails",
  route: "/v1/emails",
  status_code: 202,
  duration_ms: 48,
  client_ip: "203.0.113.7",
  user_agent: "coss-node/0.1.0",
  error_code: null,
  resource_type: "email",
  resource_id: "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
  recipient: null,
  attributes: {
    request: { body: { from: "hello@example.com", to: ["user@example.com"], subject: "Hi" } },
    response: { body: { object: "email", id: "email_01k7c8m4q2f3e9v6t5r1n0p8yz" } },
  },
} as const;

export const LogEntry = z
  .object({
    object: z.literal("log"),
    id: z.string().meta({ examples: [LOG_ID_EXAMPLE] }),
    occurred_at: z.iso.datetime().meta({ description: "When it happened." }),
    source: LogSourceEnum,
    level: LogLevelEnum,
    type: z.string().meta({
      description:
        "`api.request`, `webhook.attempt`, `webhook.forward` (an event `coss listen` forwarded), " +
        "or an email event type such as `email.delivered`.",
    }),
    message: z.string().meta({ description: "A one-line summary." }),
    request_id: z
      .string()
      .nullable()
      .meta({ description: "The `X-Request-Id` of the API request this line belongs to." }),
    api_key_id: z
      .string()
      .nullable()
      .meta({ description: "The API key that made the request. `null`: not an API request." }),
    method: z
      .string()
      .nullable()
      .meta({ description: "The HTTP method. `null`: not an HTTP line." }),
    path: z
      .string()
      .nullable()
      .meta({ description: "The request's path. `null`: not an API request." }),
    route: z.string().nullable().meta({ description: "The matched route, e.g. `/v1/emails/:id`." }),
    status_code: z
      .number()
      .int()
      .nullable()
      .meta({ description: "The API response status, or the webhook endpoint's response status." }),
    duration_ms: z
      .number()
      .int()
      .nullable()
      .meta({ description: "How long it took, in milliseconds. `null`: not timed." }),
    client_ip: z
      .string()
      .nullable()
      .meta({ description: "The caller's address. `null`: not an API request." }),
    user_agent: z
      .string()
      .nullable()
      .meta({ description: "The caller's `User-Agent`. `null`: not sent." }),
    error_code: z
      .string()
      .nullable()
      .meta({ description: "The error's `code`. `null`: no error." }),
    resource_type: z
      .string()
      .nullable()
      .meta({ description: "What the line is about: `email`, `domain`, `webhook_endpoint`…" }),
    resource_id: z
      .string()
      .nullable()
      .meta({ description: "The id of what it's about. `null`: nothing in particular." }),
    recipient: z
      .string()
      .nullable()
      .meta({ description: "The recipient an email event is about. `null`: none." }),
    attributes: z.record(z.string(), z.unknown()).meta({
      description:
        "Details: redacted request and response bodies for API requests (secrets, attachment " +
        "contents and long strings are never stored), event data for emails and webhooks.",
    }),
  })
  .meta({ id: "Log", examples: [LOG_EXAMPLE] });

export type LogEntryOutput = z.output<typeof LogEntry>;

export const LogList = z
  .object({
    object: z.literal("list"),
    data: z.array(LogEntry),
    has_more: z.boolean(),
  })
  .meta({
    id: "LogList",
    examples: [{ object: "list", data: [LOG_EXAMPLE], has_more: false }],
  });

export type LogListOutput = z.output<typeof LogList>;

/** A comma-separated list (`level=warning,error`), each item validated. */
function csv<T extends z.ZodType<string>>(item: T, description: string) {
  return z
    .string()
    .transform((value, ctx) => {
      const items = value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      const out: z.output<T>[] = [];
      for (const part of items) {
        const parsed = item.safeParse(part);
        if (!parsed.success) {
          ctx.addIssue({ code: "custom", message: `Invalid value "${part}".` });
          return z.NEVER;
        }
        out.push(parsed.data as z.output<T>);
      }
      return out;
    })
    .optional()
    .meta({ description });
}

export const STATUS_FILTER = /^[1-5](?:xx|\d\d)$/;

export const ListLogsQuery = z
  .strictObject({
    from: z.iso
      .datetime({ offset: true })
      .optional()
      .meta({ description: "Start of the range (inclusive). Defaults to an hour before `to`." }),
    to: z.iso
      .datetime({ offset: true })
      .optional()
      .meta({ description: "End of the range (exclusive). Defaults to now. At most 31 days." }),
    source: csv(LogSourceEnum, "Only these sources, comma-separated: `api,email,webhook`."),
    level: csv(LogLevelEnum, "Only these levels, comma-separated: `warning,error`."),
    type: csv(
      z.string().min(1).max(64),
      "Only these types, e.g. `email.bounced,email.complained`.",
    ),
    status: csv(
      z.string().regex(STATUS_FILTER),
      "Only these status codes or classes, e.g. `4xx,503`.",
    ),
    method: csv(
      z
        .string()
        .regex(/^[A-Za-z]{3,7}$/)
        .transform((value) => value.toUpperCase()),
      "Only these HTTP methods, e.g. `POST`.",
    ),
    route: csv(z.string().min(1).max(256), "Only these routes, e.g. `/v1/emails/:id`."),
    api_key_id: csv(z.string().min(1).max(64), "Only requests made with these API keys."),
    request_id: z.string().max(64).optional().meta({ description: "Only this request's lines." }),
    resource_id: z
      .string()
      .max(64)
      .optional()
      .meta({ description: "Only lines about this resource, e.g. an `email_…` id." }),
    q: z
      .string()
      .max(256)
      .optional()
      .meta({ description: "Free text, matched against the message, path, ids and recipient." }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_LOG_LIST_LIMIT)
      .optional()
      .meta({ description: `1-${MAX_LOG_LIST_LIMIT}, default ${DEFAULT_LOG_LIST_LIMIT}.` }),
    after: z
      .string()
      .optional()
      .meta({ description: "Cursor: the `id` of the last line of the previous page." }),
  })
  .meta({ description: "Lines are returned newest first." });

export type ListLogsQueryOutput = z.output<typeof ListLogsQuery>;

export const ORG_AUDIT_ACTOR_TYPES = ["user", "api_key", "system"] as const;
export type OrgAuditActorType = (typeof ORG_AUDIT_ACTOR_TYPES)[number];

export const DEFAULT_AUDIT_LIST_LIMIT = 50;
export const MAX_AUDIT_LIST_LIMIT = 100;

export const AuditActorTypeEnum = z.enum(ORG_AUDIT_ACTOR_TYPES).meta({
  id: "AuditActorType",
  description:
    "`user`: a member, in the dashboard (`actor_id` is the user's id, `actor_label` their " +
    "email). `api_key`: a request made with an API key (`actor_id` is the key's id). `system`: " +
    "coss.com itself, including coss.com support.",
});

const AUDIT_EVENT_ID_EXAMPLE = "oaudit_01k7c8m4q2f3e9v6t5r1n0p8yz";

const AUDIT_EVENT_EXAMPLE = {
  object: "audit_event",
  id: AUDIT_EVENT_ID_EXAMPLE,
  created_at: "2026-01-15T09:30:00.000Z",
  actor_type: "api_key",
  actor_id: "key_01k7c8m4q2f3e9v6t5r1n0p8yz",
  actor_label: "key_01k7c8m4q2f3e9v6t5r1n0p8yz",
  action: "suppression.created",
  target_type: "suppression",
  target_id: "sup_01k7c8m4q2f3e9v6t5r1n0p8yz",
  target_label: "user@example.com",
  project_id: "proj_01k7c8m4q2f3e9v6t5r1n0p8yz",
  environment_id: "env_01k7c8m4q2f3e9v6t5r1n0p8yz",
  metadata: { scope: "*", request_id: "req_01k7c8m4q2f3e9v6t5r1n0p8yz" },
  client_ip: "203.0.113.7",
  user_agent: "coss-node/0.1.0",
} as const;

export const AuditEvent = z
  .object({
    object: z.literal("audit_event"),
    id: z.string().meta({ examples: [AUDIT_EVENT_ID_EXAMPLE] }),
    created_at: z.iso.datetime(),
    actor_type: AuditActorTypeEnum,
    actor_id: z
      .string()
      .nullable()
      .meta({ description: "The user's or API key's id; `null` for the system." }),
    actor_label: z.string().meta({
      description:
        "Who made the change, copied when it was recorded so it outlives them: the user's " +
        "email, the API key's id, or `coss.com support`.",
    }),
    action: z.string().meta({
      description:
        "`<resource>.<verb>`, e.g. `api_key.created`, `domain.deleted`, `member.role_changed`.",
    }),
    target_type: z
      .string()
      .nullable()
      .meta({ description: "What was changed: `domain`, `api_key`, `member`…" }),
    target_id: z
      .string()
      .nullable()
      .meta({ description: "The id of what it acted on. `null`: nothing in particular." }),
    target_label: z
      .string()
      .nullable()
      .meta({ description: "A readable name for the target when it was changed." }),
    project_id: z
      .string()
      .nullable()
      .meta({ description: "`null` for organization-wide changes (domains, members…)." }),
    environment_id: z
      .string()
      .nullable()
      .meta({ description: "`null` for organization-wide changes (domains, members…)." }),
    metadata: z
      .record(z.string(), z.unknown())
      .meta({ description: "Details of the change; API changes include their `request_id`." }),
    client_ip: z.string().nullable().meta({ description: "The actor's address. `null`: unknown." }),
    user_agent: z
      .string()
      .nullable()
      .meta({ description: "The actor's `User-Agent`. `null`: unknown." }),
  })
  .meta({ id: "AuditEvent", examples: [AUDIT_EVENT_EXAMPLE] });

export type OrgAuditEventOutput = z.output<typeof AuditEvent>;

export const AuditEventList = z
  .object({
    object: z.literal("list"),
    data: z.array(AuditEvent),
    has_more: z.boolean(),
  })
  .meta({
    id: "AuditEventList",
    examples: [{ object: "list", data: [AUDIT_EVENT_EXAMPLE], has_more: false }],
  });

export type AuditEventListOutput = z.output<typeof AuditEventList>;

export const ListAuditEventsQuery = z
  .strictObject({
    action: csv(
      z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z][a-z0-9_.]*$/),
      "Only these actions, comma-separated. An entry ending in `.` matches every action of " +
        "that resource: `domain.,api_key.created`.",
    ),
    actor_type: csv(AuditActorTypeEnum, "Only these actor types, e.g. `user,api_key`."),
    actor_id: z
      .string()
      .max(64)
      .optional()
      .meta({ description: "Only changes made by this user or API key." }),
    target_id: z
      .string()
      .max(64)
      .optional()
      .meta({ description: "Only changes to this resource, e.g. a `dom_…` id." }),
    environment_id: z
      .string()
      .max(64)
      .optional()
      .meta({ description: "Only changes in this environment." }),
    from: z.iso
      .datetime({ offset: true })
      .optional()
      .meta({ description: "Only events at or after this time." }),
    to: z.iso
      .datetime({ offset: true })
      .optional()
      .meta({ description: "Only events before this time." }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_AUDIT_LIST_LIMIT)
      .optional()
      .meta({ description: `1-${MAX_AUDIT_LIST_LIMIT}, default ${DEFAULT_AUDIT_LIST_LIMIT}.` }),
    after: z
      .string()
      .optional()
      .meta({ description: "Cursor: the `id` of the last event of the previous page." }),
  })
  .meta({ description: "Events are returned newest first." });

export type ListAuditEventsQueryOutput = z.output<typeof ListAuditEventsQuery>;
