/**
 * What to do next about an error, by code: the envelope's `hint`. A hint names a step the caller
 * can take, with the docs page about it, and only for codes where the message doesn't already say
 * everything. A code some products share with different fixes takes a `<product>:<code>` key, which
 * wins over the plain one. `test/error-hints.test.ts` checks every code is really thrown and every
 * docs URL is a real page.
 */
import { HIPAA_MODE_RESTRICTION } from "@coss/compliance";

export const DOCS = {
  billing: "https://coss.com/docs/billing.md",
  broadcasts: "https://coss.com/docs/email/broadcasts.md",
  contacts: "https://coss.com/docs/email/contacts.md",
  delivery: "https://coss.com/docs/email/delivery.md",
  domains: "https://coss.com/docs/email/domains.md",
  environments: "https://coss.com/docs/environments.md",
  forms: "https://coss.com/docs/forms.md",
  formsDestinations: "https://coss.com/docs/forms/destinations.md",
  formsHosted: "https://coss.com/docs/forms/hosted-pages.md",
  formsSpam: "https://coss.com/docs/forms/spam-filtering.md",
  hooks: "https://coss.com/docs/hooks.md",
  inboxes: "https://coss.com/docs/inboxes.md",
  logDrains: "https://coss.com/docs/log-drains.md",
  receiving: "https://coss.com/docs/email/receiving.md",
  reputation: "https://coss.com/docs/reputation.md",
  riskContent: "https://coss.com/docs/risk/content.md",
  riskLookups: "https://coss.com/docs/risk/lookups.md",
  riskRateLimits: "https://coss.com/docs/risk/rate-limits.md",
  schedulingBookings: "https://coss.com/docs/scheduling/bookings.md",
  schedulingCalendars: "https://coss.com/docs/scheduling/calendars.md",
  schedulingEmbedding: "https://coss.com/docs/scheduling/embedding.md",
  sdk: "https://coss.com/docs/sdk.md",
  sending: "https://coss.com/docs/email/sending.md",
  signEmbedded: "https://coss.com/docs/sign/embedded-signing.md",
  signFields: "https://coss.com/docs/sign/fields-and-anchors.md",
  signTemplates: "https://coss.com/docs/sign/templates.md",
  smsCountries: "https://coss.com/docs/sms/countries-and-pricing.md",
  smsSenders: "https://coss.com/docs/sms/senders.md",
  smsSending: "https://coss.com/docs/sms/sending.md",
  spend: "https://coss.com/docs/spend.md",
  subaccounts: "https://coss.com/docs/email/subaccounts.md",
  templates: "https://coss.com/docs/email/templates.md",
  topics: "https://coss.com/docs/email/topics-and-preferences.md",
  verifyEmail: "https://coss.com/docs/verify/email.md",
  verifyFraudGuard: "https://coss.com/docs/verify/fraud-guard.md",
  verifySms: "https://coss.com/docs/verify/sms.md",
  webhooks: "https://coss.com/docs/webhooks.md",
} as const;

/** The error classes whose codes can need a hint of their own (`<product>:<code>` keys). */
export type HintProduct = "hooks" | "inboxes" | "sign" | "sms" | "verify" | "webhooks";

const RETRY_THEN_SUPPORT = "Retry later. If it keeps failing, contact support with the request_id.";

export const ERROR_HINTS: Record<string, string> = {
  // API keys and requests.
  invalid_api_key: `Check the key, or create a new one in the dashboard or with \`npx coss-cli init\`. ${DOCS.environments}`,
  missing_api_key: `Send a key as \`Authorization: Bearer coss_…\`. Create one in the dashboard or with \`npx coss-cli init\`. ${DOCS.environments}`,
  insufficient_permissions: `Keys keep the permissions they were created with: use a key that has this one, or create a new one in the dashboard. \`GET /v1/environment\` shows what this key holds. ${DOCS.environments}`,
  idempotency_key_reused: `Reuse an Idempotency-Key only for the same request. ${DOCS.sdk}`,
  request_in_progress: `Reuse an Idempotency-Key only for the same request. ${DOCS.sdk}`,
  sandbox_only: `This only works with a sandbox key. ${DOCS.environments}`,
  [HIPAA_MODE_RESTRICTION]:
    "This organization's HIPAA mode refuses this, to keep PHI within its BAA. Its compliance " +
    "settings page lists what the mode changes.",

  // Standing, plans and billing.
  organization_suspended: `This organization is suspended, so sending and changes are refused until it is reinstated. ${DOCS.delivery}`,
  account_suspended: `This organization is suspended, so sending and changes are refused until it is reinstated. ${DOCS.delivery}`,
  sending_paused: `Sending is paused because of its reputation, so look at its bounces and complaints. Sandbox keys still work. ${DOCS.reputation}`,
  marketing_paused: `Look at the marketing stream's bounces and complaints, and send transactional email in the meantime. ${DOCS.reputation}`,
  billing_hold: `Pay the overdue invoice or raise the spend limit in the organization's billing settings. Sandbox keys still work. ${DOCS.billing}`,
  budget_exceeded: `A monthly budget of the member, project or API key is used up. Owners can raise it on the Spend page's Budgets tab. ${DOCS.spend}`,
  plan_feature_unavailable: `Change the plan or add the add-on in the organization's billing settings. ${DOCS.billing}`,
  plan_limit_reached: `Upgrade the plan in the organization's billing settings, or remove something you no longer use. ${DOCS.billing}`,
  usage_limit_exceeded: `The plan's usage cap is reached. Upgrade it in the organization's billing settings. ${DOCS.billing}`,

  // Email.
  domain_not_verified:
    "A live key can only send from a verified domain. A sandbox key accepts any from " +
    `address. ${DOCS.domains}`,
  too_many_pending_domains: `Finish verifying a domain, or delete one you no longer need, before adding another. ${DOCS.domains}`,
  template_not_published: `Publish its draft with \`POST /v1/email_templates/{id}/publish\`, then send again. ${DOCS.templates}`,
  invalid_template_variables: `\`issues\` lists every variable at fault. Compare them with the template's declared variables. ${DOCS.templates}`,
  template_invalid: `Fix the draft, then publish it again. ${DOCS.templates}`,
  template_render_failed: `Try the variables with \`POST /v1/email_templates/{id}/render\`, which sends nothing. ${DOCS.templates}`,
  template_limit_reached: `Delete a template you no longer use before creating another. ${DOCS.templates}`,
  mailing_address_required: `Set the postal address with \`PATCH /v1/marketing_settings\`, then send again. ${DOCS.broadcasts}`,
  broadcast_not_sendable: `Check its \`status\`: only a \`draft\` can be sent, \`draft\`, \`scheduled\`, \`sending\` and \`paused\` can be canceled, \`scheduled\` and \`sending\` can be paused, and \`paused\` can be resumed. To send again, create a new broadcast. ${DOCS.broadcasts}`,
  broadcast_not_editable: `Check its \`status\`: only a \`draft\` can be changed, and only a \`draft\` or a broadcast canceled before sending can be deleted. Otherwise, create a new broadcast. ${DOCS.broadcasts}`,
  unknown_property: `Create it first with \`POST /v1/contact_properties\`. ${DOCS.contacts}`,
  too_many_properties: `Delete a contact property you no longer use before creating another. ${DOCS.contacts}`,
  too_many_topics: `Delete a topic you no longer use before creating another. ${DOCS.topics}`,
  confirmation_sender_required: `Set \`confirmation_from\` with \`PATCH /v1/marketing_settings\`, to a sender on a verified domain. ${DOCS.contacts}`,
  too_many_subaccounts: `Delete a sub-account you no longer use. In a live environment, a higher plan also allows more. ${DOCS.subaccounts}`,
  subaccount_paused: `Its reputation paused it. Fix the cause, then call \`POST /v1/subaccounts/{subaccount}/reinstate\`. ${DOCS.subaccounts}`,
  receiving_unavailable: `Receiving isn't on here. Contact support if you need it. ${DOCS.receiving}`,
  "inboxes:receiving_unavailable": `Add a receiving domain with \`POST /v1/domains/{id}/receiving\`, then pass it as \`domain\`. ${DOCS.inboxes}`,
  unknown_domain: `Add it with \`POST /v1/domains/{id}/receiving\`, or leave \`domain\` out. ${DOCS.inboxes}`,
  inbox_cannot_send: `Create an inbox at a receiving domain of your own to send from it. ${DOCS.inboxes}`,

  // SMS.
  invalid_phone_number: `Use E.164, like \`+14155550123\`. ${DOCS.smsSending}`,
  sender_not_found: `Live keys send from the organization's own numbers: add one under SMS in the dashboard. A sandbox key accepts any \`from\`. ${DOCS.smsSenders}`,
  sender_not_ready: `Wait for its carrier registration to be approved (the dashboard's SMS page shows its state). A sandbox key accepts any \`from\`. ${DOCS.smsSenders}`,
  "sms:country_not_allowed": `Owners and admins allow countries under SMS in the dashboard. ${DOCS.smsCountries}`,

  // Verify.
  shared_sender_unavailable: `Choose a registered number of your organization as \`sms_from\` in Verify settings: in the dashboard, or with \`PATCH /v1/verify/settings\`. ${DOCS.verifySms}`,
  verification_blocked: `The fraud guard stopped it, and the verification's \`reasons\` say why. ${DOCS.verifyFraudGuard}`,
  "verify:country_not_allowed": `Allow the country in Verify settings, or send from your own number when coss.com's shared numbers don't reach it. ${DOCS.verifySms}`,
  send_failed: `Check the destination and Verify's senders (\`sms_from\`, \`email_from\`) with \`GET /v1/verify/settings\`. ${DOCS.verifyEmail}`,

  // Sign.
  sign_unavailable: "Retry later.",
  request_not_draft: `Only a \`draft\` can be sent. To send again, create a new request. ${DOCS.signEmbedded}`,
  request_not_cancelable: `Only a \`draft\` or \`sent\` request can be canceled. ${DOCS.signEmbedded}`,
  request_not_signable: `A signing session needs a \`sent\` request that hasn't expired: send a draft with \`POST /v1/sign/requests/{id}/send\`, or create a new request. ${DOCS.signEmbedded}`,
  signer_not_embedded: `Signing sessions are for signers with \`delivery: embedded\`. ${DOCS.signEmbedded}`,
  "sign:invalid_fields": `Check \`param\` against the document's \`pages\` and \`anchors\`. ${DOCS.signFields}`,
  template_incomplete: `Give it documents, roles and a \`signature\` field for every role: \`ready\` on the template says when it can be used. ${DOCS.signTemplates}`,

  // Forms.
  forms_unavailable: RETRY_THEN_SUPPORT,
  form_limit_reached: `Delete a form you no longer use before creating another. ${DOCS.forms}`,
  captcha_not_configured: `Set a captcha up with \`PATCH /v1/risk/settings\` and give the form its \`captcha_site_key\`, or turn \`spam.captcha\` off. ${DOCS.formsSpam}`,
  hosted_needs_fields: `Define the form's \`fields\`, then turn its hosted page on. ${DOCS.formsHosted}`,
  invalid_sender: `Use an address on a verified domain of the organization, or add and verify the domain first. ${DOCS.domains}`,
  invalid_recipient: `Notifications go to members of the organization or addresses on its verified domains. ${DOCS.domains}`,
  invalid_contacts: `Create the audience, topic or property first, or map a field the form has. ${DOCS.formsDestinations}`,

  // Scheduling.
  scheduling_unavailable: RETRY_THEN_SUPPORT,
  slot_unavailable: `Read the slots again with \`GET /v1/scheduling/event_types/{event_type}/slots\`, and offer another one. ${DOCS.schedulingBookings}`,
  attendee_limit_reached: `This person is at the event type's \`max_active_bookings_per_attendee\`. Cancel or reschedule one of their bookings, or raise the limit. ${DOCS.schedulingBookings}`,
  calendar_unavailable: `The message says what's refused. Google, Microsoft and Zoom connect by consent, CalDAV with a password. ${DOCS.schedulingCalendars}`,
  origin_not_allowed: `Add this site to \`allowed_origins\` with \`PATCH /v1/scheduling/settings\`. ${DOCS.schedulingEmbedding}`,

  // Hooks.
  portal_unavailable: RETRY_THEN_SUPPORT,
  too_many_applications: `Delete an application you no longer use before creating another. ${DOCS.hooks}`,
  unknown_event_type: `Create the type with \`POST /v1/hooks/event_types\`, or restore it (\`archived: false\`) if it's archived. ${DOCS.hooks}`,
  "hooks:too_many_endpoints": `Delete an endpoint this application no longer uses before adding another. ${DOCS.hooks}`,

  // Risk.
  classification_unavailable: `Retry later. In a sandbox environment, \`[coss-test:…]\` markers always work. ${DOCS.riskContent}`,
  phone_lookup_unavailable: `Retry later. Sandbox environments use fixtures instead. ${DOCS.riskLookups}`,
  too_many_limit_buckets: `Delete a bucket you no longer use before creating another. ${DOCS.riskRateLimits}`,

  // Webhooks and log drains.
  "webhooks:too_many_endpoints": `Delete an endpoint you no longer use. If the message names your plan, upgrading also allows more. ${DOCS.webhooks}`,
  too_many_log_drains: `Delete a log drain you no longer use before creating another. ${DOCS.logDrains}`,
};

/** The hint of a code: its product's own if it has one, else the code's. */
export function hintForCode(code: string, product?: HintProduct): string | undefined {
  return (product && ERROR_HINTS[`${product}:${code}`]) ?? ERROR_HINTS[code];
}
