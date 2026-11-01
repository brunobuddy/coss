import type { StatusTone } from "@/components/status-dot";

/** Imports' kinds, statuses and phases as the pages name them (client-safe, no `@coss/migrate`). */

export const PROVIDERS = [
  {
    id: "resend",
    name: "Resend",
    keyLabel: "API key",
    keyHint: "A key with full access (re_…): sending-only keys can't read your account.",
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    keyLabel: "API key",
    keyHint:
      "A key with read access (SG.…). Create a restricted key with Read Access to everything you import.",
  },
  {
    id: "postmark",
    name: "Postmark",
    keyLabel: "Account or server token",
    keyHint:
      "An account token imports domains and lets you choose a server; a server token imports only its server, without domains.",
  },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

export const KIND_LABELS = {
  domains: {
    label: "Domains",
    description: "Added to the organization; each needs coss.com's DNS records to verify.",
  },
  templates: {
    label: "Templates",
    description:
      "Converted to coss.com's template language. Templates that convert exactly are published; others are left as drafts to review.",
  },
  contacts: {
    label: "Contacts and lists",
    description: "Contacts with their custom fields, lists (as audiences) and topics.",
  },
  suppressions: {
    label: "Suppressions",
    description:
      "Bounces, spam complaints and unsubscribes, so nobody who left gets your email again.",
  },
  webhooks: {
    label: "Webhook endpoints",
    description:
      "Created disabled, with new signing secrets: update your handler to coss.com's events, then enable them.",
  },
} as const;

export type KindId = keyof typeof KIND_LABELS;

export const PHASE_LABELS: Record<string, string> = {
  properties: "Custom fields",
  topics: "Topics",
  audiences: "Lists",
  templates: "Templates",
  contacts: "Contacts",
  memberships: "List members",
  suppressions: "Suppressions",
  webhooks: "Webhook endpoints",
};

export const ITEM_KIND_LABELS: Record<string, string> = {
  domain: "Domains",
  property: "Custom fields",
  topic: "Topics",
  audience: "Lists",
  template: "Templates",
  webhook_endpoint: "Webhook endpoints",
};

export const STATUS_LABELS: Record<string, { label: string; tone: StatusTone; pulse?: boolean }> = {
  inspecting: { label: "Reading account", tone: "info", pulse: true },
  ready: { label: "Ready to start", tone: "info" },
  queued: { label: "Queued", tone: "info", pulse: true },
  running: { label: "Importing", tone: "info", pulse: true },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "error" },
  canceled: { label: "Canceled", tone: "neutral" },
};

export const OUTCOME_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "In progress", tone: "info" },
  created: { label: "Imported", tone: "success" },
  existing: { label: "Already there", tone: "neutral" },
  skipped: { label: "Skipped", tone: "warning" },
  failed: { label: "Failed", tone: "error" },
};
