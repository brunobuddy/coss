/**
 * The commands that manage a resource: what each sends, what it prints (text and `--json`), and
 * the rules every one follows: live sends ask, secrets never come from a flag, usage errors exit 2.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dashboardPageUrl, PAGES } from "../src/commands/open.ts";
import { parseCondition } from "../src/commands/risk-manage.ts";
import { parseRule } from "../src/commands/scheduling.ts";
import { complete, findCommand } from "../src/completion.ts";
import { contactsFromCsv, parseCsv } from "../src/contacts-file.ts";
import { COMMANDS, run } from "../src/run.ts";
import { apiError, fakeFetch, LIVE_KEY, NOW, SANDBOX_KEY, testIo } from "./helpers.ts";

const env = { COSS_API_KEY: SANDBOX_KEY };
const live = { COSS_API_KEY: LIVE_KEY };
const list = (data: unknown[], has_more = false) => ({ object: "list", data, has_more });
const created_at = "2026-10-15T12:00:00.000Z";
const updated_at = created_at;

const email = {
  object: "email",
  id: "email_1",
  status: "scheduled",
  scheduled_at: "2027-01-04T09:00:00.000Z",
};
const sms = { object: "sms", id: "sms_1", status: "canceled", to: "+15005550006" };
const suppression = {
  object: "suppression",
  id: "sup_1",
  address: "ada@example.com",
  scope: "*",
  reason: "manual",
  email_id: null,
  subaccount_id: null,
  created_at,
};
const contact = {
  object: "contact",
  id: "ct_1",
  email: "ada@example.com",
  first_name: "Ada",
  last_name: null,
  status: "subscribed",
  properties: {},
  created_at,
};
const audience = {
  object: "audience",
  id: "aud_1",
  name: "Customers",
  contact_count: 2,
  created_at,
  updated_at,
};
const filter = {
  version: 1,
  match: "all",
  conditions: [{ field: "email", op: "ends_with", value: "@acme.com" }],
};
const segment = { object: "segment", id: "seg_1", name: "Acme", filter, created_at, updated_at };
const topic = {
  object: "topic",
  id: "top_1",
  key: "product",
  name: "Product news",
  description: null,
  default_subscription: "opt_in",
  visibility: "public",
  position: 0,
  created_at,
  updated_at,
};
const marketingSettings = {
  object: "marketing_settings",
  display_name: "Acme",
  mailing_address: null,
  double_opt_in_default: false,
  confirmation_from: null,
  confirmation_subject: null,
  confirmation_html: null,
  confirmation_text: null,
  confirmed_redirect_url: null,
};
const broadcast = {
  object: "broadcast",
  id: "bcast_1",
  name: "October",
  status: "paused",
  audience_id: "aud_1",
  segment_id: null,
  from: "news@acme.com",
  subject: "News",
  scheduled_at: null,
  recipients_estimated: 3,
  pause_reason: null,
  error: null,
  stats: { recipients: 0, sent: 0 },
  created_at,
};
const rule = {
  object: "risk_rule",
  id: "rrule_1",
  name: "No Tor",
  enabled: true,
  position: 0,
  events: ["signup"],
  match: "all",
  conditions: [{ field: "ip.tor", operator: "is", value: true }],
  action: "block",
  created_at,
  updated_at,
};
const riskSettings = {
  object: "risk_settings",
  review_threshold: 0.5,
  block_threshold: 0.9,
  disabled_reasons: [],
  captcha: null,
  content_thresholds: { spam: 0.8, phishing: null },
  reason_weights: {},
  updated_at: null,
};
const host = {
  object: "scheduling.host",
  id: "host_1",
  uid: "ada",
  name: "Ada",
  email: null,
  time_zone: "UTC",
  attributes: { licensed_in: ["CA", "NY"] },
  metadata: {},
  status: "active",
  created_at,
  updated_at,
};
const schedule = {
  object: "scheduling.schedule",
  id: "sch_1",
  host: "host_1",
  name: "Working hours",
  time_zone: "UTC",
  is_default: true,
  rules: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }],
  overrides: [],
  created_at,
  updated_at,
};
const eventType = {
  object: "scheduling.event_type",
  id: "evt_1",
  uid: "intro",
  title: "Intro",
  kind: "one_on_one",
  status: "active",
  duration_minutes: 30,
  requires_approval: false,
  hosts: [{ host: "host_1", role: "member", weight: 1, schedule: null }],
};
const booking = {
  object: "scheduling.booking",
  id: "book_1",
  event_type: "evt_1",
  title: "Intro",
  status: "confirmed",
  start: "2027-01-04T15:00:00.000Z",
  end: "2027-01-04T15:30:00.000Z",
  hosts: ["host_1"],
  attendees: [{ id: "att_1", uid: null, name: "Bo", email: "bo@example.com", time_zone: "UTC" }],
};
const signTemplate = {
  object: "sign_template",
  id: "stpl_1",
  name: "NDA",
  documents: [],
  roles: [{ key: "client", name: "Client" }],
  fields: [],
  ready: false,
};
const signSettings = {
  object: "sign_settings",
  allowed_origins: [],
  display_name: null,
  accent_color: null,
  theme: "system",
  disclosure: null,
  email_from: null,
  reminder_interval_days: null,
};
const form = {
  object: "form",
  id: "form_1",
  name: "Contact",
  enabled: true,
  endpoint: "https://forms.coss.test/f/form_1",
  hosted_url: null,
  allowed_origins: [],
  fields: null,
};
const drain = {
  object: "log_drain",
  id: "ldr_1",
  url: "https://logs.acme.com/in",
  description: null,
  sources: [],
  format: "ndjson",
  auth_header_name: null,
  enabled: true,
  disabled_reason: null,
  disabled_at: null,
  created_at,
  updated_at,
};
const subaccount = {
  object: "subaccount",
  id: "sub_1",
  uid: "acme",
  name: "Acme",
  metadata: { plan: "pro" },
  status: "active",
  quotas: { recipients_per_day: 100, recipients_per_second: null, burst: null },
  reputation: { status: "good", trigger: null, changed_at: null, reinstated_at: null },
  created_at,
  updated_at,
};
const deleted = (id: string) => ({ object: "x", id, deleted: true });

type Case = {
  argv: string[];
  /** "METHOD /path" it must call last. */
  route: string;
  answer: unknown;
  /** Body or query it must send. */
  body?: unknown;
  query?: Record<string, string>;
  /** Text mode prints this. */
  prints: string;
  /** Other routes the command reads first. */
  also?: Record<string, unknown>;
};

const CASES: Case[] = [
  {
    argv: ["emails", "cancel", "email_1"],
    route: "POST /v1/emails/email_1/cancel",
    answer: { ...email, status: "canceled" },
    prints: "email_1 canceled",
  },
  {
    argv: ["emails", "reschedule", "email_1", "--at", "2027-01-04T09:00:00Z"],
    route: "POST /v1/emails/email_1/reschedule",
    answer: email,
    body: { scheduled_at: "2027-01-04T09:00:00Z" },
    prints: "scheduled 2027-01-04 09:00",
  },
  {
    argv: ["suppressions", "list", "--scope", "*", "--limit", "5"],
    route: "GET /v1/suppressions",
    answer: list([suppression]),
    query: { scope: "*", limit: "5" },
    prints: "ada@example.com",
  },
  {
    argv: ["suppressions", "check", "ada@example.com", "--category", "news"],
    route: "GET /v1/suppressions/check",
    answer: {
      object: "suppression_check",
      address: "ada@example.com",
      suppressed: true,
      suppressions: [suppression],
    },
    query: { address: "ada@example.com", category: "news" },
    prints: "is suppressed",
  },
  {
    argv: ["suppressions", "add", "ada@example.com", "--scope", "news", "--subaccount", "acme"],
    route: "POST /v1/suppressions",
    answer: suppression,
    body: { address: "ada@example.com", scope: "news", subaccount: "acme" },
    prints: "sup_1",
  },
  {
    argv: ["suppressions", "remove", "sup_1"],
    route: "DELETE /v1/suppressions/sup_1",
    answer: deleted("sup_1"),
    prints: "Removed sup_1",
  },
  {
    argv: ["sms", "cancel", "sms_1"],
    route: "POST /v1/sms/sms_1/cancel",
    answer: sms,
    prints: "sms_1 canceled",
  },
  {
    argv: ["sms", "suppressions", "check", "+15005550006"],
    route: "GET /v1/sms/suppressions/check",
    answer: {
      object: "sms_suppression_check",
      phone_number: "+15005550006",
      suppressed: false,
      suppression: null,
    },
    query: { phone_number: "+15005550006" },
    prints: "isn't suppressed",
  },
  {
    argv: ["audiences", "list"],
    route: "GET /v1/audiences",
    answer: list([audience]),
    prints: "Customers",
  },
  {
    argv: ["audiences", "get", "aud_1"],
    route: "GET /v1/audiences/aud_1",
    answer: audience,
    prints: "2 contacts",
  },
  {
    argv: ["audiences", "create", "Customers"],
    route: "POST /v1/audiences",
    answer: audience,
    body: { name: "Customers" },
    prints: "aud_1",
  },
  {
    argv: ["audiences", "update", "aud_1", "--name", "Buyers"],
    route: "PATCH /v1/audiences/aud_1",
    answer: audience,
    body: { name: "Buyers" },
    prints: "aud_1",
  },
  {
    argv: ["audiences", "remove", "aud_1"],
    route: "DELETE /v1/audiences/aud_1",
    answer: deleted("aud_1"),
    prints: "Deleted aud_1",
  },
  {
    argv: ["audiences", "contacts", "list", "aud_1"],
    route: "GET /v1/audiences/aud_1/contacts",
    answer: list([contact]),
    prints: "ada@example.com",
  },
  {
    argv: ["audiences", "contacts", "add", "aud_1", "ada@example.com", "ct_2"],
    route: "POST /v1/audiences/aud_1/contacts",
    answer: { object: "audience_contacts", added: 1, existing: 1, missing: [] },
    body: { contacts: ["ada@example.com", "ct_2"] },
    prints: "1 added, 1 already there",
  },
  {
    argv: ["audiences", "contacts", "remove", "aud_1", "ct_1"],
    route: "DELETE /v1/audiences/aud_1/contacts/ct_1",
    answer: {
      object: "audience_contact",
      audience_id: "aud_1",
      contact_id: "ct_1",
      deleted: true,
    },
    prints: "Removed ct_1 from aud_1",
  },
  {
    argv: ["segments", "list"],
    route: "GET /v1/segments",
    answer: list([segment]),
    prints: "Acme",
  },
  {
    argv: ["segments", "get", "seg_1"],
    route: "GET /v1/segments/seg_1",
    answer: segment,
    prints: "ends_with",
  },
  {
    argv: ["segments", "create", "Acme", "--filter", JSON.stringify(filter)],
    route: "POST /v1/segments",
    answer: segment,
    body: { name: "Acme", filter },
    prints: "seg_1",
  },
  {
    argv: ["segments", "update", "seg_1", "--name", "Acme staff"],
    route: "PATCH /v1/segments/seg_1",
    answer: segment,
    body: { name: "Acme staff" },
    prints: "seg_1",
  },
  {
    argv: ["segments", "remove", "seg_1"],
    route: "DELETE /v1/segments/seg_1",
    answer: deleted("seg_1"),
    prints: "Deleted seg_1",
  },
  {
    argv: ["segments", "contacts", "list", "seg_1", "--limit", "3"],
    route: "GET /v1/segments/seg_1/contacts",
    answer: list([contact]),
    query: { limit: "3" },
    prints: "ada@example.com",
  },
  { argv: ["topics", "list"], route: "GET /v1/topics", answer: list([topic]), prints: "product" },
  {
    argv: ["topics", "get", "top_1"],
    route: "GET /v1/topics/top_1",
    answer: topic,
    prints: "Product news",
  },
  {
    argv: ["topics", "create", "product", "--name", "Product news", "--default", "opt_in"],
    route: "POST /v1/topics",
    answer: topic,
    body: { key: "product", name: "Product news", default_subscription: "opt_in" },
    prints: "top_1",
  },
  {
    argv: ["topics", "update", "top_1", "--description", "none", "--visibility", "private"],
    route: "PATCH /v1/topics/top_1",
    answer: topic,
    body: { description: null, visibility: "private" },
    prints: "top_1",
  },
  {
    argv: ["topics", "remove", "top_1"],
    route: "DELETE /v1/topics/top_1",
    answer: deleted("top_1"),
    prints: "Deleted top_1",
  },
  {
    argv: ["marketing", "settings", "get"],
    route: "GET /v1/marketing_settings",
    answer: marketingSettings,
    prints: "Double opt-in",
  },
  {
    argv: [
      "marketing",
      "settings",
      "set",
      "--mailing-address",
      "1 Main St",
      "--double-opt-in",
      "--confirmation-subject",
      "default",
    ],
    route: "PATCH /v1/marketing_settings",
    answer: marketingSettings,
    body: {
      mailing_address: "1 Main St",
      double_opt_in_default: true,
      confirmation_subject: null,
    },
    prints: "Display name",
  },
  {
    argv: [
      "contacts",
      "update",
      "ada@example.com",
      "--last-name",
      "",
      "--status",
      "unsubscribed",
      "--property",
      "age=36",
      "--property",
      "plan=null",
    ],
    route: "PATCH /v1/contacts/ada%40example.com",
    answer: contact,
    body: { last_name: null, status: "unsubscribed", properties: { age: 36, plan: null } },
    prints: "ct_1",
  },
  {
    argv: ["broadcasts", "update", "bcast_1", "--subject", "New", "--topic", "none"],
    route: "PATCH /v1/broadcasts/bcast_1",
    answer: broadcast,
    body: { subject: "New", topic: null },
    prints: "bcast_1",
  },
  {
    argv: ["broadcasts", "remove", "bcast_1"],
    route: "DELETE /v1/broadcasts/bcast_1",
    answer: deleted("bcast_1"),
    prints: "Deleted bcast_1",
  },
  {
    argv: ["broadcasts", "pause", "bcast_1"],
    route: "POST /v1/broadcasts/bcast_1/pause",
    answer: broadcast,
    prints: "paused",
  },
  {
    argv: ["broadcasts", "resume", "bcast_1"],
    route: "POST /v1/broadcasts/bcast_1/resume",
    answer: { ...broadcast, status: "sending" },
    prints: "sending",
  },
  {
    argv: ["risk", "rules", "list"],
    route: "GET /v1/risk/rules",
    answer: list([rule]),
    prints: "No Tor",
  },
  {
    argv: ["risk", "rules", "get", "rrule_1"],
    route: "GET /v1/risk/rules/rrule_1",
    answer: rule,
    prints: "ip.tor is true",
  },
  {
    argv: [
      "risk",
      "rules",
      "create",
      "No Tor",
      "--action",
      "block",
      "--condition",
      "ip.tor is true",
      "--condition",
      "ip.country in RU,KP",
      "--event",
      "signup",
      "--match",
      "any",
      "--disabled",
    ],
    route: "POST /v1/risk/rules",
    answer: rule,
    body: {
      name: "No Tor",
      action: "block",
      conditions: [
        { field: "ip.tor", operator: "is", value: true },
        { field: "ip.country", operator: "in", value: ["RU", "KP"] },
      ],
      events: ["signup"],
      match: "any",
      enabled: false,
    },
    prints: "rrule_1",
  },
  {
    argv: ["risk", "rules", "update", "rrule_1", "--name", "Tor", "--position", "2", "--enabled"],
    route: "PATCH /v1/risk/rules/rrule_1",
    answer: rule,
    body: { name: "Tor", position: 2, enabled: true },
    prints: "rrule_1",
  },
  {
    argv: ["risk", "rules", "delete", "rrule_1"],
    route: "DELETE /v1/risk/rules/rrule_1",
    answer: deleted("rrule_1"),
    prints: "Deleted rrule_1",
  },
  {
    argv: ["risk", "check", "email", "ada@gmial.com"],
    route: "POST /v1/risk/email/check",
    answer: {
      object: "risk_email_check",
      email: "ada@gmial.com",
      valid: true,
      domain: "gmial.com",
      canonical: null,
      disposable: false,
      deliverability: "unknown",
      role_account: false,
      free_provider: false,
      suggestion: "gmail.com",
      domain_age_days: 40,
      degraded: [],
    },
    body: { email: "ada@gmial.com" },
    prints: "gmail.com",
  },
  {
    argv: ["risk", "check", "ip", "192.0.2.1"],
    route: "POST /v1/risk/ip/check",
    answer: {
      object: "risk_ip_check",
      ip: "192.0.2.1",
      version: 4,
      private: false,
      tor: true,
      hosting: false,
      hosting_provider: null,
      hosting_kind: null,
      asn: 64500,
      as_name: "Example",
      country: "US",
      privacy: null,
      degraded: [],
    },
    body: { ip: "192.0.2.1" },
    prints: "AS64500 Example",
  },
  {
    argv: ["risk", "check", "phone", "+15005550006"],
    route: "POST /v1/risk/phone/check",
    answer: {
      object: "risk_phone_check",
      phone: "+15005550006",
      valid: true,
      country: "US",
      line_type: "mobile",
      carrier: { name: "Example", mobile_country_code: null, mobile_network_code: null },
      sim_swap: null,
      degraded: [],
    },
    body: { phone: "+15005550006" },
    prints: "mobile",
  },
  {
    argv: ["risk", "classify", "Buy now"],
    route: "POST /v1/risk/content/classify",
    answer: {
      object: "risk_content_classification",
      scores: { spam: 0.9, phishing: 0.1 },
      truncated: false,
    },
    body: { text: "Buy now" },
    prints: "0.90",
  },
  {
    argv: ["risk", "settings", "get"],
    route: "GET /v1/risk/settings",
    answer: riskSettings,
    prints: "Review at",
  },
  {
    argv: [
      "risk",
      "settings",
      "set",
      "--review-threshold",
      "0.4",
      "--disabled-reason",
      "ip.vpn",
      "--captcha",
      "off",
      "--data",
      '{"content_thresholds":{"spam":0.7}}',
    ],
    route: "PATCH /v1/risk/settings",
    answer: riskSettings,
    body: {
      content_thresholds: { spam: 0.7 },
      review_threshold: 0.4,
      disabled_reasons: ["ip.vpn"],
      captcha: null,
    },
    prints: "Block at",
  },
  {
    argv: ["scheduling", "hosts", "list"],
    route: "GET /v1/scheduling/hosts",
    answer: list([host]),
    prints: "Ada",
  },
  {
    argv: [
      "scheduling",
      "hosts",
      "create",
      "Ada",
      "--time-zone",
      "UTC",
      "--uid",
      "ada",
      "--attribute",
      "licensed_in=CA",
      "--attribute",
      "licensed_in=NY",
    ],
    route: "POST /v1/scheduling/hosts",
    answer: host,
    body: { name: "Ada", time_zone: "UTC", uid: "ada", attributes: { licensed_in: ["CA", "NY"] } },
    prints: "host_1",
  },
  {
    argv: ["scheduling", "hosts", "update", "ada", "--status", "disabled", "--email", "none"],
    route: "PATCH /v1/scheduling/hosts/ada",
    answer: host,
    body: { status: "disabled", email: null },
    prints: "host_1",
  },
  {
    argv: ["scheduling", "hosts", "remove", "ada"],
    route: "DELETE /v1/scheduling/hosts/ada",
    answer: deleted("host_1"),
    prints: "Deleted host_1",
  },
  {
    argv: ["scheduling", "schedules", "list", "ada"],
    route: "GET /v1/scheduling/hosts/ada/schedules",
    answer: list([schedule]),
    prints: "Working hours",
  },
  {
    argv: ["scheduling", "schedules", "create", "ada", "--rule", "mon-fri 09:00-17:00"],
    route: "POST /v1/scheduling/hosts/ada/schedules",
    answer: schedule,
    body: { rules: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }] },
    prints: "mon,tue,wed,thu,fri 09:00-17:00",
  },
  {
    // The API replaces a schedule whole: a change of name resends the rules it has.
    argv: ["scheduling", "schedules", "update", "ada", "sch_1", "--name", "Summer"],
    route: "PUT /v1/scheduling/hosts/ada/schedules/sch_1",
    answer: schedule,
    also: { "GET /v1/scheduling/hosts/ada/schedules/sch_1": schedule },
    body: { name: "Summer", rules: schedule.rules },
    prints: "sch_1",
  },
  {
    argv: ["scheduling", "schedules", "remove", "ada", "sch_1"],
    route: "DELETE /v1/scheduling/hosts/ada/schedules/sch_1",
    answer: deleted("sch_1"),
    prints: "Deleted sch_1",
  },
  {
    argv: ["scheduling", "event-types", "list"],
    route: "GET /v1/scheduling/event_types",
    answer: list([eventType]),
    prints: "Intro",
  },
  {
    argv: [
      "scheduling",
      "event-types",
      "create",
      "Intro",
      "--minutes",
      "30",
      "--uid",
      "intro",
      "--host",
      "ada",
      "--kind",
      "pool",
      "--requires-approval",
    ],
    route: "POST /v1/scheduling/event_types",
    answer: eventType,
    body: {
      title: "Intro",
      duration_minutes: 30,
      uid: "intro",
      hosts: [{ host: "ada" }],
      kind: "pool",
      requires_approval: true,
    },
    prints: "30 minutes",
  },
  {
    argv: ["scheduling", "event-types", "update", "intro", "--status", "archived", "--no-approval"],
    route: "PATCH /v1/scheduling/event_types/intro",
    answer: eventType,
    body: { status: "archived", requires_approval: false },
    prints: "evt_1",
  },
  {
    argv: [
      "scheduling",
      "book",
      "intro",
      "--start",
      "2027-01-04T15:00:00Z",
      "--time-zone",
      "UTC",
      "--name",
      "Bo",
      "--email",
      "bo@example.com",
      "--answer",
      "topic=Pricing",
    ],
    route: "POST /v1/scheduling/bookings",
    answer: booking,
    body: {
      event_type: "intro",
      start: "2027-01-04T15:00:00Z",
      attendee: { time_zone: "UTC", name: "Bo", email: "bo@example.com" },
      answers: { topic: "Pricing" },
    },
    prints: "book_1 confirmed",
  },
  {
    argv: ["scheduling", "reschedule", "book_1", "--start", "2027-01-05T15:00:00Z"],
    route: "POST /v1/scheduling/bookings/book_1/reschedule",
    answer: booking,
    body: { start: "2027-01-05T15:00:00Z" },
    prints: "book_1",
  },
  {
    argv: ["scheduling", "approve", "book_1"],
    route: "POST /v1/scheduling/bookings/book_1/approve",
    answer: booking,
    prints: "book_1",
  },
  {
    argv: ["scheduling", "decline", "book_1"],
    route: "POST /v1/scheduling/bookings/book_1/decline",
    answer: { ...booking, status: "declined" },
    prints: "declined",
  },
  {
    argv: ["sign", "settings", "get"],
    route: "GET /v1/sign/settings",
    answer: signSettings,
    prints: "Display name",
  },
  {
    argv: [
      "sign",
      "settings",
      "set",
      "--display-name",
      "default",
      "--theme",
      "dark",
      "--reminder-days",
      "7",
      "--origin",
      "https://app.acme.com",
    ],
    route: "PATCH /v1/sign/settings",
    answer: signSettings,
    body: {
      display_name: null,
      theme: "dark",
      reminder_interval_days: 7,
      allowed_origins: ["https://app.acme.com"],
    },
    prints: "Theme",
  },
  {
    argv: ["sign", "templates", "list"],
    route: "GET /v1/sign/templates",
    answer: list([signTemplate]),
    prints: "NDA",
  },
  {
    argv: [
      "sign",
      "templates",
      "create",
      "NDA",
      "--document",
      "sdoc_1",
      "--role",
      "client:Client",
      "--signing-order",
      "sequential",
    ],
    route: "POST /v1/sign/templates",
    answer: signTemplate,
    body: {
      name: "NDA",
      documents: [{ document_id: "sdoc_1" }],
      roles: [{ key: "client", name: "Client" }],
      signing_order: "sequential",
    },
    prints: "stpl_1",
  },
  {
    argv: [
      "forms",
      "update",
      "form_1",
      "--disabled",
      "--redirect",
      "none",
      "--data",
      '{"spam":{"captcha":"off"}}',
    ],
    route: "PATCH /v1/forms/form_1",
    answer: form,
    body: { spam: { captcha: "off" }, enabled: false, redirect_url: null },
    prints: "form_1",
  },
  {
    argv: ["forms", "remove", "form_1"],
    route: "DELETE /v1/forms/form_1",
    answer: deleted("form_1"),
    prints: "Deleted form_1",
  },
  {
    argv: ["log-drains", "list"],
    route: "GET /v1/log_drains",
    answer: list([drain]),
    prints: "https://logs.acme.com/in",
  },
  {
    argv: ["log-drains", "get", "ldr_1"],
    route: "GET /v1/log_drains/ldr_1",
    answer: drain,
    prints: "every source",
  },
  {
    argv: [
      "log-drains",
      "create",
      "https://logs.acme.com/in",
      "--source",
      "api,email",
      "--format",
      "datadog",
    ],
    route: "POST /v1/log_drains",
    answer: { ...drain, secret: "whsec_abc" },
    body: { url: "https://logs.acme.com/in", sources: ["api", "email"], format: "datadog" },
    prints: "whsec_abc",
  },
  {
    argv: ["log-drains", "update", "ldr_1", "--disabled", "--remove-auth-header"],
    route: "PATCH /v1/log_drains/ldr_1",
    answer: drain,
    body: { enabled: false, auth_header: null },
    prints: "ldr_1",
  },
  {
    argv: ["log-drains", "delete", "ldr_1"],
    route: "DELETE /v1/log_drains/ldr_1",
    answer: deleted("ldr_1"),
    prints: "Deleted ldr_1",
  },
  {
    argv: ["subaccounts", "list"],
    route: "GET /v1/subaccounts",
    answer: list([subaccount], true),
    prints: "acme",
  },
  {
    argv: ["subaccounts", "get", "acme"],
    route: "GET /v1/subaccounts/acme",
    answer: subaccount,
    prints: "100 a day",
  },
  {
    argv: [
      "subaccounts",
      "create",
      "Acme",
      "--uid",
      "acme",
      "--metadata",
      "plan=pro",
      "--per-day",
      "100",
    ],
    route: "POST /v1/subaccounts",
    answer: subaccount,
    body: {
      name: "Acme",
      uid: "acme",
      metadata: { plan: "pro" },
      quotas: { recipients_per_day: 100 },
    },
    prints: "sub_1",
  },
  {
    argv: [
      "subaccounts",
      "update",
      "acme",
      "--status",
      "disabled",
      "--uid",
      "none",
      "--burst",
      "none",
    ],
    route: "PATCH /v1/subaccounts/acme",
    answer: subaccount,
    body: { status: "disabled", uid: null, quotas: { burst: null } },
    prints: "sub_1",
  },
  {
    argv: ["subaccounts", "delete", "acme"],
    route: "DELETE /v1/subaccounts/acme",
    answer: { ...subaccount, status: "deleting" },
    prints: "deleting",
  },
  {
    argv: ["subaccounts", "reinstate", "acme"],
    route: "POST /v1/subaccounts/acme/reinstate",
    answer: subaccount,
    prints: "sub_1",
  },
  {
    argv: ["subaccounts", "stats", "acme", "--from", "2026-10-01"],
    route: "GET /v1/subaccounts/acme/stats",
    answer: {
      object: "subaccount_stats",
      subaccount_id: "sub_1",
      from: "2026-10-01",
      to: "2026-10-15",
      data: [
        {
          date: "2026-10-02",
          recipients: 5,
          sent: 5,
          delivered: 4,
          bounced: 1,
          complained: 0,
          failed: 0,
          suppressed: 0,
        },
      ],
    },
    query: { from: "2026-10-01" },
    prints: "2026-10-02",
  },
];

/** The commands tested outside the table, below. */
const ELSEWHERE = ["contacts import", "contacts export"];

describe("what each command sends and prints", () => {
  test("every command this file is about has a case", () => {
    const covered = new Set([
      ...ELSEWHERE,
      ...CASES.map((item) => findCommand(COMMANDS, item.argv)?.command.name),
    ]);
    const families =
      /^(suppressions|audiences|segments|topics|marketing|log-drains|subaccounts|risk (rules|check|classify|settings)|scheduling (hosts|schedules|book|reschedule|approve|decline)|sign (settings|templates)|emails (cancel|reschedule)|sms cancel|sms suppressions check|contacts (update|import|export)|broadcasts (update|remove|pause|resume)|forms (update|remove)|scheduling event-types)( |$)/;
    const missing = COMMANDS.map((command) => command.name).filter(
      (name) =>
        families.test(name) &&
        !covered.has(name) &&
        !["scheduling hosts", "scheduling event-types", "sign templates"].includes(name),
    );
    expect(missing).toEqual([]);
  });

  for (const item of CASES) {
    test(`coss ${item.argv.slice(0, 3).join(" ")}`, async () => {
      const api = fakeFetch({ [item.route]: item.answer as object, ...(item.also as object) });
      const io = testIo({ fetch: api.fetch, env });
      expect(await run(item.argv, io)).toBe(0);
      const last = api.requests.at(-1);
      expect(`${last?.method} ${last?.url.pathname}`).toBe(item.route);
      if (item.body !== undefined) expect(last?.body as object).toEqual(item.body as object);
      for (const [name, value] of Object.entries(item.query ?? {})) {
        expect(last?.url.searchParams.get(name)).toBe(value);
      }
      expect(io.output()).toContain(item.prints);

      const json = testIo({ fetch: api.fetch, env });
      expect(await run([...item.argv, "--json"], json)).toBe(0);
      for (const line of json.output().trim().split("\n")) JSON.parse(line);
    });
  }

  test("with the wrong arguments, each exits 2 without calling the API", async () => {
    for (const argv of [
      ["emails", "cancel"],
      ["emails", "reschedule", "email_1"],
      ["emails", "reschedule", "email_1", "--at", "soon"],
      ["suppressions", "check"],
      ["suppressions", "list", "--limit", "500"],
      ["suppressions", "check", "a@b.c", "--stream", "nope"],
      ["sms", "suppressions", "check"],
      ["audiences", "update", "aud_1"],
      ["audiences", "contacts", "add", "aud_1"],
      ["segments", "create", "Acme"],
      ["segments", "create", "Acme", "--filter", "not json"],
      ["segments", "update", "seg_1"],
      ["topics", "create", "product", "--name", "News"],
      ["topics", "update", "top_1"],
      ["marketing", "settings", "set"],
      ["marketing", "settings", "set", "--double-opt-in", "--no-double-opt-in"],
      ["contacts", "update", "ct_1"],
      ["contacts", "import"],
      ["broadcasts", "update", "bcast_1"],
      ["risk", "rules", "create", "Tor"],
      ["risk", "rules", "create", "Tor", "--action", "block", "--condition", "ip.tor"],
      ["risk", "rules", "create", "Tor", "--action", "block", "--condition", "ip.tor maybe true"],
      ["risk", "rules", "update", "rrule_1"],
      ["risk", "classify"],
      ["risk", "settings", "set"],
      ["risk", "settings", "set", "--captcha-required"],
      ["risk", "settings", "set", "--captcha", "off", "--captcha-secret-stdin"],
      ["scheduling", "hosts", "create", "Ada"],
      ["scheduling", "hosts", "update", "ada"],
      ["scheduling", "schedules", "create", "ada"],
      ["scheduling", "schedules", "create", "ada", "--rule", "whenever"],
      ["scheduling", "schedules", "create", "ada", "--rule", "funday 09:00-17:00"],
      ["scheduling", "schedules", "update", "ada", "sch_1"],
      ["scheduling", "event-types", "create", "Intro"],
      ["scheduling", "event-types", "update", "intro"],
      ["scheduling", "book", "intro", "--start", "2027-01-04T15:00:00Z"],
      ["scheduling", "reschedule", "book_1"],
      ["sign", "settings", "set"],
      ["sign", "templates", "create", "NDA", "--role", "client"],
      ["forms", "update", "form_1"],
      ["forms", "update", "form_1", "--enabled", "--disabled"],
      ["log-drains", "create"],
      ["log-drains", "create", "https://x.test", "--format", "syslog"],
      ["log-drains", "create", "https://x.test", "--source", "nope"],
      ["log-drains", "update", "ldr_1"],
      ["log-drains", "update", "ldr_1", "--auth-header", "X", "--remove-auth-header"],
      ["subaccounts", "update", "acme"],
      ["subaccounts", "update", "acme", "--status", "paused"],
      ["subaccounts", "create", "Acme", "--per-day", "many"],
    ]) {
      const api = fakeFetch({});
      const io = testIo({ fetch: api.fetch, env });
      expect(`${argv.join(" ")}: ${await run(argv, io)}`).toBe(`${argv.join(" ")}: 2`);
      expect(api.requests).toEqual([]);
    }
  });

  test("an API failure exits 1 with its message", async () => {
    const api = fakeFetch({
      "POST /v1/emails/email_1/cancel": () =>
        apiError(422, "invalid_request_error", "email_not_cancelable", "It already went out."),
    });
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["emails", "cancel", "email_1"], io)).toBe(1);
    expect(io.errors()).toContain("Couldn't cancel the email: It already went out.");
  });

  test("what people typed is printed without escape sequences", async () => {
    const api = fakeFetch({
      "GET /v1/audiences": list([{ ...audience, name: "Bad\u001b[31m" }]),
      "GET /v1/risk/rules/rrule_1": {
        ...rule,
        conditions: [{ field: "email.domain", operator: "eq", value: "x\u001b]0;pwn\u0007" }],
      },
    });
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["audiences", "list"], io)).toBe(0);
    expect(await run(["risk", "rules", "get", "rrule_1"], io)).toBe(0);
    expect(io.output()).not.toContain("\u001b");
  });

  test("a list with more says how to read them all", async () => {
    const api = fakeFetch({ "GET /v1/subaccounts": list([subaccount], true) });
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["subaccounts", "list"], io)).toBe(0);
    expect(io.errors()).toContain("coss api subaccounts --paginate");
  });
});

describe("live keys", () => {
  const BOOK = [
    "scheduling",
    "book",
    "intro",
    "--start",
    "2027-01-04T15:00:00Z",
    "--time-zone",
    "UTC",
    "--email",
    "bo@example.com",
  ];
  const SENDING: { argv: string[]; route: string; answer: object }[] = [
    {
      argv: ["broadcasts", "resume", "bcast_1"],
      route: "POST /v1/broadcasts/bcast_1/resume",
      answer: broadcast,
    },
    { argv: BOOK, route: "POST /v1/scheduling/bookings", answer: booking },
    {
      argv: ["scheduling", "reschedule", "book_1", "--start", "2027-01-05T15:00:00Z"],
      route: "POST /v1/scheduling/bookings/book_1/reschedule",
      answer: booking,
    },
    {
      argv: ["scheduling", "approve", "book_1"],
      route: "POST /v1/scheduling/bookings/book_1/approve",
      answer: booking,
    },
    {
      argv: ["scheduling", "decline", "book_1"],
      route: "POST /v1/scheduling/bookings/book_1/decline",
      answer: booking,
    },
    {
      // A time that has passed sends it right away.
      argv: ["emails", "reschedule", "email_1", "--at", "2020-01-01T00:00:00Z"],
      route: "POST /v1/emails/email_1/reschedule",
      answer: email,
    },
  ];

  for (const { argv, route, answer } of SENDING) {
    const name = argv.slice(0, 3).join(" ");

    test(`${name}: off a terminal it needs --yes, and sends nothing without it`, async () => {
      const api = fakeFetch({ [route]: answer });
      const io = testIo({ fetch: api.fetch, env: live });
      expect(await run(argv, io)).toBe(2);
      expect(io.errors()).toContain("This is a live key: pass --yes");
      expect(api.requests).toEqual([]);

      const yes = testIo({ fetch: api.fetch, env: live });
      expect(await run([...argv, "--yes"], yes)).toBe(0);
      expect(`${api.requests.at(-1)?.method} ${api.requests.at(-1)?.url.pathname}`).toBe(route);
    });

    test(`${name}: on a terminal it asks`, async () => {
      const routes = { [route]: answer, "GET /v1/broadcasts/bcast_1": broadcast };
      const refused = fakeFetch(routes);
      const no = testIo({
        fetch: refused.fetch,
        env: live,
        stdinIsTTY: true,
        answers: ["no"],
      });
      expect(await run(argv, no)).toBe(1);
      expect(no.errors()).toContain("Nothing was sent.");
      expect(refused.requests.filter((request) => request.method !== "GET")).toEqual([]);

      const agreed = fakeFetch(routes);
      const yes = testIo({ fetch: agreed.fetch, env: live, stdinIsTTY: true, answers: ["yes"] });
      expect(await run(argv, yes)).toBe(0);
      expect(agreed.requests.at(-1)?.method).toBe("POST");
    });
  }

  test("a reschedule to a later time doesn't ask", async () => {
    const api = fakeFetch({ "POST /v1/emails/email_1/reschedule": email });
    const io = testIo({ fetch: api.fetch, env: live });
    const later = new Date(NOW.getTime() + 3_600_000).toISOString();
    expect(await run(["emails", "reschedule", "email_1", "--at", later], io)).toBe(0);
  });

  const IRREVERSIBLE: { argv: string[]; route: string; answer: object }[] = [
    {
      argv: ["forms", "remove", "form_1"],
      route: "DELETE /v1/forms/form_1",
      answer: deleted("form_1"),
    },
    {
      argv: ["subaccounts", "delete", "acme"],
      route: "DELETE /v1/subaccounts/acme",
      answer: { ...subaccount, status: "deleting" },
    },
  ];

  for (const { argv, route, answer } of IRREVERSIBLE) {
    const name = argv.slice(0, 2).join(" ");

    test(`${name}: off a terminal it needs --yes, and deletes nothing without it`, async () => {
      const api = fakeFetch({ [route]: answer });
      const io = testIo({ fetch: api.fetch, env: live });
      expect(await run(argv, io)).toBe(2);
      expect(io.errors()).toContain("This is a live key: pass --yes");
      expect(api.requests).toEqual([]);

      const yes = testIo({ fetch: api.fetch, env: live });
      expect(await run([...argv, "--yes"], yes)).toBe(0);
      expect(`${api.requests[0]?.method} ${api.requests[0]?.url.pathname}`).toBe(route);
    });

    test(`${name}: on a terminal it asks`, async () => {
      const refused = fakeFetch({ [route]: answer });
      const no = testIo({ fetch: refused.fetch, env: live, stdinIsTTY: true, answers: ["no"] });
      expect(await run(argv, no)).toBe(1);
      expect(no.errors()).toContain("can't be undone");
      expect(no.errors()).toContain("Nothing was deleted.");
      expect(refused.requests).toEqual([]);

      const agreed = fakeFetch({ [route]: answer });
      const yes = testIo({ fetch: agreed.fetch, env: live, stdinIsTTY: true, answers: ["yes"] });
      expect(await run(argv, yes)).toBe(0);
      expect(agreed.requests).toHaveLength(1);
    });

    test(`${name}: a sandbox key doesn't ask`, async () => {
      const api = fakeFetch({ [route]: answer });
      expect(await run(argv, testIo({ fetch: api.fetch, env }))).toBe(0);
      expect(api.requests).toHaveLength(1);
    });
  }

  test("other removes don't ask, like every remove before them", async () => {
    const api = fakeFetch({ "DELETE /v1/audiences/aud_1": deleted("aud_1") });
    const io = testIo({ fetch: api.fetch, env: live });
    expect(await run(["audiences", "remove", "aud_1"], io)).toBe(0);
  });
});

describe("secrets", () => {
  test("no flag of these commands holds the value of a secret", () => {
    for (const name of ["log-drains create", "log-drains update", "risk settings set"]) {
      const command = COMMANDS.find((item) => item.name === name);
      for (const flag of Object.keys(command?.flags ?? {})) {
        expect(flag).not.toMatch(/value|token|password|^(captcha-)?secret$/);
      }
    }
    const header = COMMANDS.find((item) => item.name === "log-drains create")?.flags["auth-header"];
    expect(header?.value).toBe("<name>");
  });

  test("a log drain's auth header takes its value from stdin", async () => {
    const api = fakeFetch({ "POST /v1/log_drains": { ...drain, secret: "whsec_abc" } });
    const argv = ["log-drains", "create", "https://x.test", "--auth-header", "DD-API-KEY"];
    const io = testIo({ fetch: api.fetch, env, answers: ["dd-key\n"] });
    expect(await run(argv, io)).toBe(0);
    expect(api.requests[0]?.body).toEqual({
      url: "https://x.test",
      auth_header: { name: "DD-API-KEY", value: "dd-key" },
    });
    expect(io.output()).not.toContain("dd-key");

    const empty = testIo({ fetch: api.fetch, env });
    expect(await run(argv, empty)).toBe(2);
    expect(empty.errors()).toContain("reads the value of DD-API-KEY from stdin");
  });

  test("a terminal asks for it without echoing", async () => {
    const api = fakeFetch({ "PATCH /v1/log_drains/ldr_1": drain });
    const asked: unknown[] = [];
    const io = testIo({
      fetch: api.fetch,
      env,
      stdinIsTTY: true,
      prompt: async (_question, options) => {
        asked.push(options);
        return "typed-secret";
      },
    });
    expect(await run(["log-drains", "update", "ldr_1", "--auth-header", "X-Key"], io)).toBe(0);
    expect(asked).toEqual([{ secret: true }]);
    expect(api.requests[0]?.body).toEqual({
      auth_header: { name: "X-Key", value: "typed-secret" },
    });
  });

  test("the captcha secret comes from stdin, and never from inline --data", async () => {
    const api = fakeFetch({ "PATCH /v1/risk/settings": riskSettings });
    const argv = ["risk", "settings", "set", "--captcha", "turnstile"];
    const io = testIo({ fetch: api.fetch, env, answers: ["cf-secret"] });
    expect(await run([...argv, "--captcha-secret-stdin", "--captcha-required"], io)).toBe(0);
    expect(api.requests[0]?.body).toEqual({
      captcha: { provider: "turnstile", secret: "cf-secret", required: true },
    });

    const inline = testIo({ fetch: api.fetch, env });
    const data = '{"captcha":{"provider":"turnstile","secret":"cf-secret"}}';
    expect(await run(["risk", "settings", "set", "--data", data], inline)).toBe(2);
    expect(inline.errors()).toContain("never goes on the command line");
    expect(api.requests).toHaveLength(1);

    const both = testIo({ fetch: api.fetch, env });
    expect(await run([...argv, "--captcha-secret-stdin", "--data", "-"], both)).toBe(2);
  });
});

describe("contacts import and export", () => {
  test("parseCsv reads quotes, escaped quotes, newlines in cells, CRLF and a BOM", () => {
    expect(parseCsv('﻿email,note\r\n"a@b.c","says ""hi"",\nthere"\r\n\r\nd@e.f,\n')).toEqual([
      ["email", "note"],
      ["a@b.c", 'says "hi",\nthere'],
      ["d@e.f", ""],
    ]);
  });

  test("contactsFromCsv maps headers and properties, and reports the rest", () => {
    const parsed = contactsFromCsv(
      "Email Address,First Name,lastName,status,age,vip,color,created_at,id\n" +
        "ada@example.com,Ada,,subscribed,36,true,red,2026-01-01,ct_1\n" +
        "'=bo@example.com,,,pending,x,,,,\n",
      new Map([
        ["age", "number"],
        ["vip", "boolean"],
      ]),
    );
    expect(parsed.ignored).toEqual(["color"]);
    expect(parsed.contacts).toEqual([
      {
        email: "ada@example.com",
        first_name: "Ada",
        status: "subscribed",
        properties: { age: 36, vip: true },
      },
      // An export's guarded cell, its `pending` left for the API to report, a bad number kept.
      { email: "=bo@example.com", status: "pending", properties: { age: "x" } },
    ]);
  });

  test("addresses alone, one per line, need no header; a header without email is refused", () => {
    expect(contactsFromCsv("ada@example.com\nbo@example.com\n", new Map()).contacts).toEqual([
      { email: "ada@example.com" },
      { email: "bo@example.com" },
    ]);
    expect(() => contactsFromCsv("name,city\nAda,London\n", new Map())).toThrow('"email" column');
  });

  const answer = {
    object: "contact_import",
    created: 1,
    updated: 0,
    kept_unsubscribed: 0,
    invalid: [],
  };
  const routes = {
    "POST /v1/contacts/import": answer,
    "GET /v1/contact_properties": list([
      { object: "contact_property", key: "age", type: "number" },
    ]),
  };

  test("import sends a CSV with the environment's properties, to an audience", async () => {
    const api = fakeFetch(routes);
    const io = testIo({ fetch: api.fetch, env });
    writeFileSync(join(io.cwd, "people.csv"), "email,age,shoe\nada@example.com,36,42\n");
    const argv = ["contacts", "import", "people.csv", "--audience", "aud_1"];
    expect(await run(argv, io)).toBe(0);
    expect(api.requests.at(-1)?.body).toEqual({
      contacts: [{ email: "ada@example.com", properties: { age: 36 } }],
      audience_id: "aud_1",
    });
    expect(io.output()).toContain("1 created");
    expect(io.errors()).toContain("no such property: shoe");
  });

  test("import takes a JSON array from stdin, asking for no properties", async () => {
    const api = fakeFetch(routes);
    const io = testIo({ fetch: api.fetch, env, answers: ['[{"email":"ada@example.com"}]'] });
    expect(await run(["contacts", "import", "-", "--json"], io)).toBe(0);
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0]?.body).toEqual({ contacts: [{ email: "ada@example.com" }] });
    expect(JSON.parse(io.output())).toMatchObject({ created: 1 });
  });

  test("import exits 1 when it skipped a row, and a missing file is a usage error", async () => {
    const api = fakeFetch({
      ...routes,
      "POST /v1/contacts/import": {
        ...answer,
        invalid: [{ index: 0, email: "nope", message: "Not an address." }],
      },
    });
    const io = testIo({ fetch: api.fetch, env, answers: ['[{"email":"nope"}]'] });
    expect(await run(["contacts", "import", "-"], io)).toBe(1);
    expect(io.errors()).toContain("Skipped nope: Not an address.");
    expect(await run(["contacts", "import", "missing.csv"], testIo({ env }))).toBe(2);
  });

  const csv = 'email,first_name\r\nada@example.com,"A\u001b[31m"\r\n';
  const exported = {
    "GET /v1/contacts/export": () => new Response(csv, { headers: { "content-type": "text/csv" } }),
  };

  test("export prints the CSV to a pipe as it came, filtered by status", async () => {
    const api = fakeFetch(exported);
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["contacts", "export", "--status", "subscribed"], io)).toBe(0);
    expect(io.output()).toBe(csv);
    expect(api.requests[0]?.url.searchParams.get("status")).toBe("subscribed");
  });

  test("export to a terminal has no escape sequences; --json carries the CSV", async () => {
    const api = fakeFetch(exported);
    let written = "";
    const io = testIo({
      fetch: api.fetch,
      env,
      stdout: {
        isTTY: true,
        write: (chunk) => {
          written += String(chunk);
        },
      },
    });
    expect(await run(["contacts", "export"], io)).toBe(0);
    expect(written).toContain("ada@example.com");
    expect(written).not.toContain("\u001b");
    const json = testIo({ fetch: api.fetch, env });
    expect(await run(["contacts", "export", "--json"], json)).toBe(0);
    expect(JSON.parse(json.output())).toEqual({ csv });
  });

  test("export --out saves it, readable only by you", async () => {
    const api = fakeFetch(exported);
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["contacts", "export", "--out", "all.csv", "--json"], io)).toBe(0);
    const file = join(io.cwd, "all.csv");
    expect(readFileSync(file, "utf8")).toBe(csv);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(io.output())).toEqual({ file, size: Buffer.byteLength(csv) });
    expect(await run(["contacts", "export", "--out", "no/such/dir/x.csv"], io)).toBe(1);
  });
});

describe("flag shorthands", () => {
  test("parseCondition types values by what they look like", () => {
    expect(parseCondition("ip.tor is true")).toEqual({
      field: "ip.tor",
      operator: "is",
      value: true,
    });
    expect(parseCondition("velocity.ip_1h gt 10").value).toBe(10);
    expect(parseCondition("ip.country in RU, KP").value).toEqual(["RU", "KP"]);
    expect(parseCondition("email.domain eq evil example").value).toBe("evil example");
  });

  test("parseRule reads ranges, lists, numbers, and ranges over the weekend", () => {
    expect(parseRule("mon-fri 09:00-17:00")).toEqual({
      days: [1, 2, 3, 4, 5],
      start: "09:00",
      end: "17:00",
    });
    expect(parseRule("sat,sun 10:00 - 12:00").days).toEqual([0, 6]);
    expect(parseRule("Monday,3 09:00-10:00").days).toEqual([1, 3]);
    expect(parseRule("fri-mon 08:00-24:00")).toEqual({
      days: [0, 1, 5, 6],
      start: "08:00",
      end: "24:00",
    });
  });
});

describe("groups that are also commands", () => {
  test("coss scheduling hosts, event-types and sign templates still list", async () => {
    for (const [argv, route, answer] of [
      [["scheduling", "hosts"], "GET /v1/scheduling/hosts", host],
      [["scheduling", "hosts", "--limit", "2"], "GET /v1/scheduling/hosts", host],
      [["scheduling", "event-types"], "GET /v1/scheduling/event_types", eventType],
      [["sign", "templates"], "GET /v1/sign/templates", signTemplate],
    ] as const) {
      const api = fakeFetch({ [route]: list([answer]) });
      const io = testIo({ fetch: api.fetch, env });
      expect(await run([...argv], io)).toBe(0);
      expect(`${api.requests[0]?.method} ${api.requests[0]?.url.pathname}`).toBe(route);
    }
  });

  test("a word after one that isn't a subcommand says what is", async () => {
    const io = testIo({ env });
    expect(await run(["scheduling", "hosts", "delete", "ada"], io)).toBe(2);
    expect(io.errors()).toContain('Unknown command "scheduling hosts delete"');
    expect(io.errors()).toContain("`coss scheduling hosts create`");
    expect(io.errors()).toContain("`coss api <path>`");
  });

  test("completion offers their subcommands and new groups' flags", async () => {
    const io = testIo();
    const c = (words: string[]) => complete(COMMANDS, words, io);
    expect(await c(["scheduling", "hosts", ""])).toEqual(["list", "create", "update", "remove"]);
    expect(await c(["scheduling", "event-types", ""])).toEqual(["list", "create", "update"]);
    expect(await c(["sign", "templates", ""])).toEqual(["list", "create"]);
    expect(await c(["risk", "check", ""])).toEqual(["email", "ip", "phone"]);
    expect(await c(["audiences", "contacts", ""])).toEqual(["list", "add", "remove"]);
    expect(await c(["log-drains", ""])).toEqual(["list", "get", "create", "update", "delete"]);
    expect(await c(["log-drains", "create", "--format", "d"])).toEqual(["datadog"]);
    expect(await c(["scheduling", "book", "--ye"])).toEqual(["--yes"]);
    expect(await c(["marketing", "settings", ""])).toEqual(["get", "set"]);
    expect(await c(["subaccounts", "update", "x", "--status", ""])).toEqual(["active", "disabled"]);
  });
});

describe("coss open", () => {
  test("knows every page of the dashboard's products, Developers and settings", () => {
    const routes = readFileSync(
      join(import.meta.dir, "../../dashboard-routes/src/index.ts"),
      "utf8",
    );
    const urls = PAGES.map((page) =>
      dashboardPageUrl("", { organization: "o", project: "p", environment: "e" }, page),
    );
    const settings = routes.indexOf("ORGANIZATION_SETTINGS");
    const paths = [...routes.matchAll(/\bpath: "([^"]*)"/g)];
    expect(paths.length).toBeGreaterThan(40);
    for (const match of paths) {
      const path = match[1] ?? "";
      const inSettings = settings !== -1 && (match.index ?? 0) > settings;
      expect(urls).toContain(inSettings ? `/o/settings${path}` : `/o/p/e${path}`);
    }
  });
});
