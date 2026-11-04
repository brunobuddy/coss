// Wire types of the dashboard's iOS app API (`/api/mobile/v1`): snake_case, ISO 8601 dates.
// Each product area added after the first release has a file of its own, re-exported here.

export type * from "./account.ts";
export type * from "./broadcasts.ts";
export type * from "./contacts.ts";
export type * from "./home.ts";
export type * from "./organization-settings.ts";
export type * from "./risk-settings.ts";
export type * from "./scheduling.ts";
export type * from "./sms-senders.ts";
export type * from "./spend.ts";
export type * from "./templates.ts";

export type MobileErrorCode =
  | "invalid_request"
  | "invalid_grant"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "sso_required"
  | "two_factor_required"
  /** The action needs a recent sign-in: sign in again, then retry. */
  | "reauthentication_required"
  | "rate_limited"
  | "internal_error";

export type MobileErrorBody = {
  error: {
    code: MobileErrorCode;
    message: string;
    /** For `sso_required` / `two_factor_required`: the dashboard page that resolves it. */
    url?: string;
  };
};

export type TokenRequest = { code: string; code_verifier: string };

export type MobileUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  two_factor_enabled: boolean;
};

export type TokenResponse = { token: string; user: MobileUser };

export type MeResponse = {
  user: MobileUser;
  organizations: { name: string; slug: string; role: string }[];
};

export type EnvironmentMode = "live" | "sandbox";

export type MobileEnvironment = { id: string; name: string; slug: string; mode: EnvironmentMode };

export type MobileProject = {
  id: string;
  name: string;
  slug: string;
  environments: MobileEnvironment[];
};

export type ReputationStatus = "good" | "warning" | "suspended";

export type ReputationCheck = {
  trigger: string;
  trigger_label: string;
  severity: "ok" | "warning" | "suspend";
  message: string;
  rate: number | null;
  count: number;
  volume: number;
  warning_threshold: number | null;
  suspend_threshold: number | null;
  minimum_volume: number | null;
};

export type ReputationStanding = {
  status: ReputationStatus;
  reason: string | null;
  reason_label: string | null;
  status_changed_at: string | null;
  evaluated_at: string | null;
  window: { start: string; end: string } | null;
  checks: ReputationCheck[];
};

export type BillingAlerts = {
  held: "delinquent" | "spend_limit" | "credit_limit" | "admin" | null;
  past_due: boolean;
  allowance: { label: string; used: number; cap: number } | null;
};

export type OrganizationResponse = {
  organization: { id: string; name: string; slug: string; role: string; suspended: boolean };
  standing: ReputationStanding;
  /** `null` when the member may not read billing. */
  billing: BillingAlerts | null;
  /** The member's own personal keys reached their monthly budget (live sends paused). */
  budget_paused: boolean;
  can: {
    read_email: boolean;
    read_sms: boolean;
    read_reputation: boolean;
    read_billing: boolean;
    read_domain: boolean;
    read_audit: boolean;
    read_webhook: boolean;
    read_risk: boolean;
    read_log: boolean;
    read_suppression: boolean;
    read_api_key: boolean;
    read_hook: boolean;
    read_log_drain: boolean;
    read_risk_rule: boolean;
    read_risk_list: boolean;
    read_environment: boolean;
    read_template: boolean;
    read_broadcast: boolean;
    read_contact: boolean;
    read_sms_suppression: boolean;
    read_sms_sender: boolean;
    read_sso: boolean;
    read_scim: boolean;
    read_scheduling: boolean;
    update_scheduling: boolean;
  };
  projects: MobileProject[];
};

export type ReputationEventType =
  | "warning_raised"
  | "warning_cleared"
  | "suspended"
  | "reinstated"
  | "marketing_paused"
  | "marketing_reinstated";

export type ReputationHistoryEvent = {
  id: string;
  type: ReputationEventType;
  trigger: string;
  trigger_label: string;
  actor: "automatic" | "coss";
  created_at: string;
};

export type ReputationResponse = {
  standing: ReputationStanding;
  /** SES paused the organization's sending (independent of coss.com's standing). */
  sending_paused: boolean;
  events: ReputationHistoryEvent[];
};

export type EmailStatus = "queued" | "sent" | "failed" | "scheduled" | "canceled";

export type EmailCounts = Record<EmailStatus, number>;

export type EnvironmentResponse = {
  project: { id: string; name: string; slug: string };
  environment: MobileEnvironment;
  activity: {
    days: ({ date: string } & EmailCounts)[];
    totals: EmailCounts & {
      tracked_opens: number;
      opened: number;
      tracked_clicks: number;
      clicked: number;
    };
  };
};

export type MobileEmailSummary = {
  id: string;
  to: string[];
  subject: string;
  status: EmailStatus;
  sandbox: boolean;
  created_at: string;
  scheduled_at: string | null;
  /** The environment's content storage was off: subject, bodies and attachment names are gone. */
  content_discarded_at: string | null;
};

export type EmailListResponse = { data: MobileEmailSummary[]; next_cursor: string | null };

export type EmailRecipientStatus =
  | "queued"
  | "sent"
  | "delivery_delayed"
  | "delivered"
  | "bounced"
  | "suppressed"
  | "complained"
  | "failed"
  | "canceled";

export type MobileEmail = MobileEmailSummary & {
  from: string;
  cc: string[];
  bcc: string[];
  reply_to: string[];
  category: string | null;
  /** The plain-text body; HTML bodies are never sent to the app. */
  text: string | null;
  has_html: boolean;
  sent_at: string | null;
  recipients: {
    address: string;
    type: "to" | "cc" | "bcc";
    status: EmailRecipientStatus;
    last_event_at: string | null;
  }[];
  attachments: { id: string; filename: string; content_type: string; size: number }[];
  tracking: { opens: boolean; clicks: boolean; open_count: number; click_count: number };
  /** `discard`: the environment's content storage was off when it was sent. */
  content_storage: "store" | "discard";
  /** The template it was rendered from (`version` `null`: a dashboard test send of the draft). */
  template: { id: string; version: number | null; locale: string } | null;
  /** The broadcast it is part of. */
  broadcast_id: string | null;
};

export type EmailEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained"
  | "email.failed"
  | "email.suppressed"
  | "email.scheduled"
  | "email.canceled"
  | "email.opened"
  | "email.clicked"
  | "email.rescheduled"
  | "email.unsubscribed";

export type MobileEmailEvent = {
  id: string;
  type: EmailEventType;
  recipient: string | null;
  occurred_at: string;
  /** A one-line explanation (SMTP response, bounce diagnostic, failure message…); may be empty. */
  detail: string;
};

export type EmailResponse = {
  email: MobileEmail;
  events: MobileEmailEvent[];
  has_more_events: boolean;
  /** May cancel it while it is scheduled (`email:send`). */
  can_send: boolean;
};

/** Cursor pages: pass `next_cursor` back as `after`. */
export type Page<T> = { data: T[]; next_cursor: string | null };

export type Verdict = "pass" | "fail" | "gray" | "processing_failed" | null;

export type ReceivedEmailSummary = {
  id: string;
  status: "received" | "blocked";
  from: string | null;
  mail_from: string;
  recipients: string[];
  subject: string | null;
  spam: boolean;
  size: number;
  attachment_count: number;
  received_at: string;
};

export type ReceivedEmail = ReceivedEmailSummary & {
  to: string[];
  cc: string[];
  reply_to: string[];
  message_id: string | null;
  in_reply_to: string | null;
  sent_at: string | null;
  blocked_reason: "virus" | null;
  verdicts: {
    spam: Verdict;
    virus: Verdict;
    spf: Verdict;
    dkim: Verdict;
    dmarc: Verdict;
    dmarc_policy: string | null;
  };
  /** The plain-text body; HTML bodies are never sent to the app. */
  text: string | null;
  has_html: boolean;
  truncated: boolean;
  headers: { name: string; value: string }[];
  attachments: {
    id: string;
    filename: string | null;
    content_type: string;
    disposition: "attachment" | "inline";
    size: number;
  }[];
};

export type SmsStatus =
  | "queued"
  | "scheduled"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed"
  | "canceled";

export type MobileSmsSummary = {
  id: string;
  from: string;
  to: string;
  /** The text's first characters (the whole text is on the message). */
  preview: string;
  status: SmsStatus;
  segments: number;
  sandbox: boolean;
  created_at: string;
  scheduled_at: string | null;
};

export type SmsListResponse = { data: MobileSmsSummary[]; next_cursor: string | null };

export type MobileSms = Omit<MobileSmsSummary, "preview"> & {
  body: string;
  encoding: "gsm7" | "ucs2";
  /** ISO 3166 country of `to`. */
  country: string;
  tags: { name: string; value: string }[];
  failure: { code: string; message: string } | null;
  sent_at: string | null;
  delivered_at: string | null;
};

export type SmsEventType =
  | "sms.scheduled"
  | "sms.sent"
  | "sms.delivered"
  | "sms.undelivered"
  | "sms.failed"
  | "sms.suppressed"
  | "sms.canceled";

export type MobileSmsEvent = {
  id: string;
  type: SmsEventType;
  occurred_at: string;
  /** The failure, the suppression or the carrier's error code, as the dashboard shows it; may be empty. */
  detail: string;
};

export type SmsResponse = { sms: MobileSms; events: MobileSmsEvent[] };

export type MobileReceivedSms = {
  id: string;
  from: string;
  /** The organization's number that received it. */
  to: string;
  body: string;
  segments: number;
  keyword: "stop" | "start" | "help" | null;
  sandbox: boolean;
  created_at: string;
};

export type ReceivedSmsListResponse = Page<MobileReceivedSms>;

export type LogSource =
  | "api"
  | "email"
  | "webhook"
  | "risk"
  | "smtp"
  | "sms"
  | "sign"
  | "verify"
  | "forms"
  | "scheduling";
export type LogLevel = "info" | "warning" | "error";
export type LogRange = "1h" | "24h" | "7d";

export type LogEntry = {
  id: string;
  occurred_at: string;
  source: LogSource;
  level: LogLevel;
  type: string;
  message: string;
  request_id: string | null;
  api_key_id: string | null;
  method: string | null;
  path: string | null;
  status_code: number | null;
  duration_ms: number | null;
  error_code: string | null;
  resource_type: string | null;
  resource_id: string | null;
  recipient: string | null;
};

export type LogEntryDetail = LogEntry & {
  client_ip: string | null;
  user_agent: string | null;
  /** The source's details (redacted request/response for API lines), as stored. */
  attributes: Record<string, unknown>;
  api_key_name: string | null;
};

export type LogEntryResponse = { entry: LogEntryDetail; related: LogEntry[] };

export type Suppression = {
  id: string;
  address: string;
  scope: string;
  reason: "bounce" | "complaint" | "manual" | "import" | "unsubscribe";
  email_id: string | null;
  created_at: string;
};

export type ApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  created_at: string;
  last_used_at: string | null;
  /** `full`, or how a restricted key's permissions read (as the dashboard labels them). */
  access: "full" | "sending" | "read_only" | "custom";
  /** `resource:action`, e.g. `email:send` (a full-access key: every one there is today). */
  permissions: string[];
  /** The member it is assigned to (a personal key: their spend); `null`: an organization key. */
  owner: {
    id: string;
    name: string;
    email: string;
    /** Their role now; `null` once they left (the key no longer works). */
    role: string | null;
  } | null;
  /** A live key whose budget (its own, its owner's or its project's) is used up. */
  paused: boolean;
};

export type ApiKeysResponse = {
  prefix: string;
  /** Members may create personal keys in this environment. */
  personal_keys: boolean;
  data: ApiKey[];
};

export type WebhookEndpoint = {
  id: string;
  url: string;
  description: string | null;
  event_types: string[];
  api_version: string;
  enabled: boolean;
  disabled_reason: "manual" | "failing" | null;
  disabled_at: string | null;
  failing_since: string | null;
  created_at: string;
};

export type WebhookAttempt = {
  id: string;
  attempted_at: string;
  status_code: number | null;
  duration_ms: number;
  error: string | null;
};

export type WebhookDelivery = {
  id: string;
  event_id: string;
  event_type: string;
  status: "pending" | "succeeded" | "failed";
  attempt_count: number;
  next_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  attempts: WebhookAttempt[];
  created_at: string;
};

export type WebhookEndpointResponse = {
  endpoint: WebhookEndpoint;
  deliveries: Page<WebhookDelivery>;
  /** `webhook:update`: retry, recover, enable and disable. */
  can_update: boolean;
};

export type WebhookEndpointEnabledRequest = { enabled: boolean };

export type RiskDecision = "allow" | "review" | "block";
export type RiskOutcome = "legitimate" | "fraud" | "abuse";

export type RiskAssessmentSummary = {
  id: string;
  event: string;
  event_name: string | null;
  decision: RiskDecision;
  score: number;
  user: { id: string | null; email: string | null };
  reason_codes: string[];
  outcome: RiskOutcome | null;
  review_status: "open" | "resolved" | null;
  created_at: string;
};

export type RiskAssessment = RiskAssessmentSummary & {
  ip: string | null;
  degraded: string[];
  reasons: { code: string; message: string }[];
  /** The stored signals (no identifiers), as the public API returns them. */
  signals: Record<string, unknown>;
  can_review: boolean;
};

export type RiskFeedbackRequest = { outcome: RiskOutcome; note?: string };

export type DomainStatus = "pending" | "verified" | "temporary_failure" | "failed" | "deleting";
export type RecordStatus = "verified" | "missing" | "mismatch" | "not_checked";

export type DomainSummary = {
  id: string;
  name: string;
  status: DomainStatus;
  can_send: boolean;
  last_checked_at: string | null;
  created_at: string;
};

export type DomainsResponse = {
  data: DomainSummary[];
  /** SES paused sending for the organization. */
  sending_paused: boolean;
};

export type DnsRecord = {
  purpose: string;
  type: string;
  name: string;
  value: string;
  priority: number | null;
  status: RecordStatus;
  found: string[];
};

export type Domain = DomainSummary & {
  mail_from_domain: string | null;
  mail_from_status: string | null;
  verified_at: string | null;
  records: DnsRecord[];
  tracking: {
    hostname: string;
    status: string;
    message: string | null;
    record: DnsRecord;
  } | null;
  receiving: { hostname: string; environment: string | null; record: DnsRecord } | null;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  two_factor_enabled: boolean;
  /** Managed by the organization's directory (SCIM). */
  directory: boolean;
  you: boolean;
  joined_at: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
};

export type MembersResponse = {
  members: Member[];
  invitations: Invitation[];
  require_two_factor: boolean;
};

export type InvoiceStatus = "open" | "paid" | "void" | "uncollectible";

export type InvoiceSummary = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  period: { start: string; end: string } | null;
  total: number;
  amount_due: number;
  due_at: string | null;
  finalized_at: string | null;
  paid_at: string | null;
};

export type BillingResponse = {
  plan: string;
  plan_name: string;
  status: "active" | "past_due" | "delinquent";
  holds: { reason: string; since: string }[];
  period: { start: string; end: string };
  /** Integer cents. */
  estimate: { usage: number; credit: number; total: number };
  credit_remaining: number;
  spend_limit: number | null;
  payment_method: { type: string; brand: string | null; last4: string | null } | null;
  usage: {
    meter: string;
    label: string;
    units: string;
    quantity: number;
    included: number | null;
  }[];
  invoices: InvoiceSummary[];
};

export type Invoice = InvoiceSummary & {
  subtotal: number;
  discount: number;
  credit: number;
  tax: number;
  amount_paid: number;
  lines: { id: string; description: string; quantity: number | null; amount: number }[];
};

export type AuditEvent = {
  id: string;
  created_at: string;
  action: string;
  /** "API key created". */
  action_label: string;
  actor_type: "user" | "api_key" | "system";
  actor_label: string | null;
  target_label: string | null;
  /** The environment's name, or `null` for organization-wide events. */
  environment: string | null;
  /** `field: from → to` changes and other details. */
  details: string;
  client_ip: string | null;
};

export type AuditResponse = { plan_allows: boolean } & Page<AuditEvent>;

export type HookApplication = { id: string; uid: string | null; name: string; created_at: string };

export type HookEndpoint = {
  id: string;
  url: string;
  description: string | null;
  /** Event types it receives; empty: all. */
  filter_types: string[];
  rate_limit_per_second: number | null;
  enabled: boolean;
  disabled_reason: "manual" | "failing" | null;
  disabled_at: string | null;
  failing_since: string | null;
  created_at: string;
};

export type HookAttempt = {
  id: string;
  attempted_at: string;
  status_code: number | null;
  duration_ms: number;
  error: string | null;
  response_excerpt: string | null;
};

export type HookDelivery = {
  id: string;
  message_id: string;
  endpoint_id: string;
  status: "pending" | "succeeded" | "failed";
  attempt_count: number;
  next_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  created_at: string;
};

export type HookApplicationResponse = {
  application: HookApplication;
  endpoints: HookEndpoint[];
  /** The latest 20. */
  messages: { id: string; event_type: string; created_at: string }[];
};

export type HookEndpointResponse = {
  application: { id: string; name: string };
  endpoint: HookEndpoint;
  deliveries: Page<HookDelivery>;
  last_recovery: { created_at: string; requeued: number; running: boolean } | null;
};

export type HookMessageResponse = {
  application: { id: string; name: string };
  message: { id: string; event_type: string; created_at: string; payload: unknown };
  deliveries: (HookDelivery & { endpoint_url: string | null; attempts: HookAttempt[] })[];
};

export type HookEventType = { name: string; description: string | null; archived: boolean };

export type TrackingRule = {
  opens: boolean;
  clicks: boolean;
  unsubscribe: boolean;
  updated_at: string;
};

export type TrackingSettings = {
  /** `null`: not set, so tracking is off by default. */
  default: TrackingRule | null;
  categories: (TrackingRule & { category: string })[];
};

export type LogDrainSource =
  | "api"
  | "email"
  | "webhook"
  | "risk"
  | "smtp"
  | "sms"
  | "sign"
  | "verify"
  | "forms"
  | "scheduling"
  | "audit";

export type LogDrain = {
  id: string;
  url: string;
  description: string | null;
  /** Empty: all sources. */
  sources: LogDrainSource[];
  format: "ndjson" | "loki" | "datadog" | "otlp";
  /** Never the header's value. */
  auth_header_name: string | null;
  enabled: boolean;
  disabled_reason: "manual" | "failing" | null;
  disabled_at: string | null;
  created_at: string;
};

export type LogDrainsResponse = { plan_allows: boolean; data: LogDrain[] };

export type LogDrainBatch = {
  id: string;
  status: "pending" | "succeeded" | "failed";
  line_count: number;
  byte_size: number;
  attempt_count: number;
  next_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  last_attempt: {
    status_code: number | null;
    duration_ms: number;
    error: string | null;
    response_excerpt: string | null;
  } | null;
  created_at: string;
};

export type LogDrainResponse = {
  drain: LogDrain;
  queued_lines: number;
  batches: Page<LogDrainBatch>;
};

export type RiskRule = {
  id: string;
  name: string;
  enabled: boolean;
  position: number;
  /** Empty: every event. */
  events: string[];
  /** The conditions as the dashboard writes them ("Email is disposable and Country in RU"). */
  when: string;
  action: RiskDecision;
};

export type RiskListEntry = {
  id: string;
  list: "allow" | "block";
  type: string;
  value: string;
  note: string | null;
  expires_at: string | null;
  created_at: string;
};

export type RecoverRequest = { since_hours: 1 | 24 | 168 | 720 };
export type RecoverResponse = { requeued: number; has_more: boolean };

export type RescheduleEmailRequest = { scheduled_at: string };
export type RescheduleEmailResponse = { scheduled_at: string };

export type RiskAssessmentsResponse = Page<RiskAssessmentSummary> & {
  /** `risk:feedback`: resolve reviews from the queue. */
  can_review: boolean;
};

export type PushCategory = "reputation" | "billing" | "endpoints" | "risk_reviews";

/** This session's push registration. Categories read as on until the device registers. */
export type PushSettings = {
  registered: boolean;
  categories: Record<PushCategory, boolean>;
};

export type RegisterPushRequest = {
  /** The APNs device token, hex. */
  token: string;
  /** `sandbox` for development builds. */
  apns_environment: "production" | "sandbox";
  /** Omitted: a new registration gets every category, a refresh keeps its own. */
  categories?: PushCategory[];
};

/** The categories that stay on; the rest turn off. */
export type UpdatePushRequest = { categories: PushCategory[] };
