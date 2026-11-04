/**
 * How the diagnoses' next steps name the ways to look further: this server's tools, or what to do
 * elsewhere when it has none. `test/agent-surface.test.ts` checks every tool named here exists.
 */
import type { ProductReferences } from "coss/diagnose";

export const TOOL_REFERENCES: ProductReferences = {
  search_logs: "search_logs",
  get_account_status: "get_account_status",
  check_email_suppression: "check_suppression",
  list_sms_numbers: "list_sms_numbers",
  check_sms_suppression: "check_sms_suppression",
  remove_sms_suppression: "remove_sms_suppression",
  start_verification: "start_verification",
  get_verify_settings: "get_verify_settings",
  update_verify_settings: "update_verify_settings",
  add_risk_list_entry: "add_risk_list_entry",
  send_sign_request: "send_sign_request",
  remind_sign_request: "remind_sign_request",
  create_sign_session: "create_sign_session",
  get_sign_audit_trail: "get_sign_audit_trail",
  download_signed_document: "the dashboard, or the SDK's coss.sign.requests.signedDocument(id)",
  create_sign_request: "create_sign_request",
  release_form_submission: "release_form_submission",
  update_form: "save_form",
  find_emails: "find_emails",
  list_webhook_endpoints: "list_webhook_endpoints",
  list_hook_attempts: "list_hook_attempts",
  retry_hook_delivery: "retry_hook_delivery",
  enable_hook_endpoint:
    "the dashboard, the portal or the SDK's coss.hooks.endpoints.update(application, id, { enabled: true })",
  recover_hook_endpoint:
    "the dashboard, the portal or the SDK's coss.hooks.endpoints.recover(application, id, { since })",
  save_scheduling_host: "save_scheduling_host",
  save_scheduling_schedule: "save_scheduling_schedule",
  save_scheduling_event_type: "save_scheduling_event_type",
  list_scheduling_calendars: "list_scheduling_calendars",
  authorize_scheduling_calendar: "authorize_scheduling_calendar",
  list_scheduling_bookings: "list_scheduling_bookings",
};
