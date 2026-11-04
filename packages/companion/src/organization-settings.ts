// Organization settings (general, single sign-on, directory sync), plans and DMARC reports.

import type { DomainStatus, Page } from "./index.ts";

/** `GET /orgs/{org}/settings`: the General tab (`apps/web/src/app/[orgSlug]/settings/page.tsx`). */
export type OrganizationSettingsResponse = {
  organization: { id: string; name: string; slug: string };
  /** `organization:update` (owners and admins); the changes themselves stay on coss.com. */
  can_update: boolean;
  two_factor: {
    required: boolean;
    /** Members without two-factor, of `members`. */
    members_without: number;
    members: number;
    /** The signed-in user has it set up (needed to require it). */
    you: boolean;
  };
  /** `null`: the member may not read the SSO settings. */
  sso: { required: boolean } | null;
  /** `null`: the member may not read directory sync. */
  scim: { connected: boolean } | null;
  api_version: {
    /** `null`: set on the organization's first API request. */
    pinned: string | null;
    latest: string;
  };
  /** `null`: the organization isn't in HIPAA mode. */
  hipaa_mode: { enabled_at: string; baa_signed_at: string; baa_reference: string } | null;
  /** The settings tabs the member may open (General always). */
  can: { read_billing: boolean; read_sso: boolean; read_scim: boolean; read_audit: boolean };
};

export type SsoProviderType = "oidc" | "saml";

/** `GET /orgs/{org}/settings/sso` (`sso:read`). Never a client secret or a certificate. */
export type SsoSettingsResponse = {
  provider: {
    type: SsoProviderType;
    domains: string[];
    /** Provider domains that are no longer verified email domains (the provider is inactive). */
    unverified_domains: string[];
    active: boolean;
    oidc: { issuer: string; client_id: string } | null;
    saml: { sso_url: string; idp_entity_id: string | null } | null;
    /** Members who signed in with SSO so far, of `members`. */
    linked_members: number;
  } | null;
  members: number;
  required: boolean;
  /** Whether the plan includes SSO (only asked while there is no provider). */
  plan_allows: boolean;
  /** `sso:update`: the values to give the identity provider; `null` for other roles. */
  setup: {
    oidc_redirect_uri: string | null;
    saml_acs_url: string | null;
    saml_entity_id: string | null;
    saml_metadata_url: string | null;
  } | null;
  /** `sso:require` (owners): what requiring SSO needs; `null` for other roles. */
  requirement: {
    active_provider: boolean;
    signed_in_with_sso: boolean;
    has_password: boolean;
    /** Owners without a password, so without break-glass access. */
    owners_without_password: string[];
  } | null;
};

/** `GET /orgs/{org}/settings/scim` (`scim:read`). Never a token. */
export type ScimSettingsResponse = {
  directory: {
    status: "active" | "decommissioning";
    connected_at: string;
    active_users: number;
    inactive_users: number;
    groups: number;
    /** When the directory last used one of its tokens. */
    last_sync_at: string | null;
    /** Owners the directory deactivated (directory sync never changes owners). */
    deactivated_owners: string[];
  } | null;
  /** Whether the plan includes directory sync (only asked while nothing is connected). */
  plan_allows: boolean;
  sso_active: boolean;
  /** `scim:update` (owners and admins). */
  can_update: boolean;
  /** `scim:update`: the SCIM base URL for the identity provider. */
  base_url: string | null;
  /** `scim:update`: the tokens' dates (never the tokens). */
  tokens: {
    status: "active" | "expired";
    created_at: string;
    expires_at: string;
    last_used_at: string | null;
  }[];
  group_roles: { group: string; role: "admin" | "member" }[];
  /** Recent changes to the connection and its tokens, newest first. */
  events: { id: number; label: string; actor: string; created_at: string }[];
};

/** A cell of "What each plan includes": text, or whether the plan has it. */
export type PlanCell = string | boolean;

/** `GET /orgs/{org}/settings/billing/plans` (`billing:read`). */
export type PlansResponse = {
  /** Every plan, cheapest first; prices worded as the dashboard shows them. */
  plans: {
    key: string;
    name: string;
    description: string;
    /** "$0", "$20/month", "From $500/month". */
    price: string;
    highlights: string[];
    current: boolean;
  }[];
  /** Why self-serve changes are off (a sales contract), else `null`. */
  managed_note: string | null;
  /** `billing:update` (owners): may change plan on coss.com. */
  can_manage: boolean;
  /** One row per limit and feature, a cell per plan in `plans` order. */
  includes: { label: string; cells: PlanCell[] }[];
  add_ons: { name: string; description: string }[];
  usage_prices: { label: string; rates: string[] }[];
};

export type DmarcPolicy = "none" | "quarantine" | "reject";
export type DmarcStage = "not_checked" | "no_record" | "monitoring" | "quarantine" | "reject";
export type DmarcNextStepKind = "publish" | "add_reporting" | "complete_rollout" | "tighten";

export type DmarcSourceSummary = {
  source_ip: string;
  header_from: string;
  messages: number;
  passing: number;
  via_coss: boolean;
};

/** `GET /orgs/{org}/domains/{id}/dmarc` (`domain:read`). */
export type DmarcOverviewResponse = {
  domain: { id: string; name: string; status: DomainStatus };
  /** `null`: this deployment doesn't receive email. */
  report_address: string | null;
  /** The domain's own published record. */
  record: string | null;
  policy: DmarcPolicy | null;
  inherited_from: string | null;
  policy_since: string | null;
  stage: DmarcStage;
  partial: boolean;
  reporting: boolean;
  ready: boolean;
  next: { kind: DmarcNextStepKind; policy: DmarcPolicy; record: string } | null;
  checks: { id: string; ok: boolean; message: string }[];
  warnings: string[];
  /** The readiness window's reports. */
  summary: {
    window_days: number;
    messages: number;
    passing: number;
    coss_messages: number;
    coss_passing: number;
    sources: DmarcSourceSummary[];
  };
  /** Days at a full quarantine before reject (the guidance's copy). */
  days_at_quarantine: number;
};

export type MobileDmarcReportSummary = {
  id: string;
  reporter: string;
  period_start: string;
  period_end: string;
  messages: number;
  passing: number;
  truncated: boolean;
  received_at: string;
};

/** `GET /orgs/{org}/domains/{id}/dmarc/reports?after=` (newest first). */
export type DmarcReportsResponse = Page<MobileDmarcReportSummary>;

export type MobileDmarcRecord = {
  source_ip: string;
  count: number;
  header_from: string;
  envelope_from: string | null;
  dkim: "pass" | "fail";
  spf: "pass" | "fail";
  disposition: DmarcPolicy;
  reasons: { type: string; comment: string | null }[];
  via_coss: boolean;
};

/** `GET /orgs/{org}/domains/{id}/dmarc/reports/{report_id}`. */
export type DmarcReportResponse = {
  domain: { id: string; name: string };
  report: MobileDmarcReportSummary & {
    reporter_email: string | null;
    /** The reporter's own id of the report. */
    report_id: string;
    /** The policy the reporter found: "p=none sp=reject pct=50". */
    policy_seen: string;
    /** Every row of the report. */
    record_count: number;
    /** The first rows, as reported (at most 200: open the report on coss.com for the rest). */
    records: MobileDmarcRecord[];
  };
};
