/**
 * What the product diagnoses share (`coss/diagnose`): the verdict, summary and next steps every
 * answer has, and the references next steps name ways to look further by. Each caller names them
 * in its own terms: an SDK call (the default), a CLI command, an MCP tool.
 */
import type { CossResult } from "./core/errors.ts";

/** The part every product diagnosis has. */
export interface ProductDiagnosis<V extends string = string> {
  verdict: V;
  /** One sentence for a person. */
  summary: string;
  /** What the state means. */
  explanation: string;
  next_steps: string[];
  /** Account or setup problems that affect this one or the next ones. */
  warnings: string[];
}

/** The ways to look further that product diagnoses point at. */
export type ProductDiagnosisAction =
  | "search_logs"
  | "get_account_status"
  | "check_email_suppression"
  | "list_sms_numbers"
  | "check_sms_suppression"
  | "remove_sms_suppression"
  | "start_verification"
  | "get_verify_settings"
  | "update_verify_settings"
  | "add_risk_list_entry"
  | "send_sign_request"
  | "remind_sign_request"
  | "create_sign_session"
  | "get_sign_audit_trail"
  | "download_signed_document"
  | "create_sign_request"
  | "release_form_submission"
  | "update_form"
  | "find_emails"
  | "list_webhook_endpoints"
  | "list_hook_attempts"
  | "retry_hook_delivery"
  | "enable_hook_endpoint"
  | "recover_hook_endpoint"
  | "save_scheduling_host"
  | "save_scheduling_schedule"
  | "save_scheduling_event_type"
  | "list_scheduling_calendars"
  | "authorize_scheduling_calendar"
  | "list_scheduling_bookings";

export type ProductReferences = Record<ProductDiagnosisAction, string>;

/** The SDK's calls for each action. */
export const PRODUCT_SDK_REFERENCES: ProductReferences = {
  search_logs: "coss.logs.list({ source, level })",
  get_account_status: "coss.reputation.get(), coss.billing.get()",
  check_email_suppression: "coss.email.suppressions.list({ address })",
  list_sms_numbers: "coss.sms.numbers.list()",
  check_sms_suppression: "coss.sms.suppressions.check({ phone_number })",
  remove_sms_suppression: "coss.sms.suppressions.remove(id)",
  start_verification: "coss.verify.start({ to })",
  get_verify_settings: "coss.verify.settings.get()",
  update_verify_settings: "coss.verify.settings.update({ sms_from })",
  add_risk_list_entry: 'coss.risk.lists.add("allow", { ip })',
  send_sign_request: "coss.sign.requests.send(id)",
  remind_sign_request: "coss.sign.requests.remind(id)",
  create_sign_session: "coss.sign.sessions.create(requestId, signerId)",
  get_sign_audit_trail: "coss.sign.requests.auditTrail(id)",
  download_signed_document: "coss.sign.requests.signedDocument(id)",
  create_sign_request: "coss.sign.requests.create({ … })",
  release_form_submission: "coss.forms.submissions.release(formId, id)",
  update_form: "coss.forms.update(id, { … })",
  find_emails: "coss.email.list({ to })",
  list_webhook_endpoints: "coss.webhookEndpoints.list()",
  list_hook_attempts: "coss.hooks.deliveries.listAttempts(application, id)",
  retry_hook_delivery: "coss.hooks.deliveries.retry(application, id)",
  enable_hook_endpoint: "coss.hooks.endpoints.update(application, id, { enabled: true })",
  recover_hook_endpoint: "coss.hooks.endpoints.recover(application, id, { since })",
  save_scheduling_host: 'coss.scheduling.hosts.update(host, { status: "active" })',
  save_scheduling_schedule: "coss.scheduling.schedules.create(host, { rules })",
  save_scheduling_event_type: "coss.scheduling.eventTypes.update(eventType, { … })",
  list_scheduling_calendars: "coss.scheduling.calendars.list(host)",
  authorize_scheduling_calendar: "coss.scheduling.calendars.authorize(host, { provider })",
  list_scheduling_bookings: "coss.scheduling.bookings.list({ host, start_after, start_before })",
};

/** The default references with a caller's own on top. */
export function productReferences(references?: Partial<ProductReferences>): ProductReferences {
  return { ...PRODUCT_SDK_REFERENCES, ...references };
}

const MINUTE = 60_000;

export function minutesSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / MINUTE));
}

/** A call's data, or `undefined` when it failed (or the key may not read it). */
export async function softly<T>(call: Promise<CossResult<T>>): Promise<T | undefined> {
  const result = await call;
  return result.error ? undefined : result.data;
}
