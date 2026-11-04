/**
 * The plans. A plan's monthly fee is credit spendable on any product's usage, so a month costs
 * the larger of the fee and the usage (plus add-ons). Free has no credit but includes 3,000
 * emails, 1,000 MB each of attachments and received data past each email's first MB, 1,000 form
 * submissions, 1,000 MB of their uploads and 50,000 Hooks messages a month and blocks usage beyond
 * its allowance. Every plan includes 100 phone checks, 3 inboxes, Hooks messages, Scheduling hosts
 * and Risk assessments a month (past Free's, assessments go on in a reduced form instead of
 * stopping: `packages/risk/AGENTS.md`).
 */
import { type Entitlements, perDay, perSecond } from "./entitlements.ts";
import type { MeterKey } from "./meters.ts";

/** Risk phone checks every plan includes each month. */
const PHONE_CHECKS_INCLUDED = 100;
/** Inbox-days every plan includes each month: 3 inboxes for the longest month. */
const INBOX_DAYS_INCLUDED = 3 * 31;
/** Hooks messages each plan includes each month. */
const HOOKS_MESSAGES_INCLUDED = {
  free: 50_000,
  pro: 500_000,
  scale: 5_000_000,
  enterprise: 50_000_000,
} as const;

/** Host-days each plan includes each month: its hosts for the longest month. */
const SCHEDULING_HOST_DAYS_INCLUDED = {
  free: 3 * 31,
  pro: 25 * 31,
  scale: 100 * 31,
  enterprise: 100 * 31,
} as const;
/** Risk assessments each plan includes each month: the same dollars as its Hooks messages. */
const RISK_ASSESSMENTS_INCLUDED = {
  free: 10_000,
  pro: 50_000,
  scale: 500_000,
  enterprise: 5_000_000,
} as const;
/** Risk content checks (`classify` on its own) each plan includes each month. */
const RISK_CONTENT_CHECKS_INCLUDED = {
  free: 10_000,
  pro: 100_000,
  scale: 1_000_000,
  enterprise: 10_000_000,
} as const;

export const PLAN_KEYS = ["free", "pro", "scale", "enterprise"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export type PlanDefinition = {
  key: PlanKey;
  name: string;
  description: string;
  /** Upgrades go to a higher rank, downgrades to a lower one. */
  rank: number;
  /** Whether customers can switch to it from the dashboard (Enterprise is sold by sales). */
  selfServe: boolean;
  /** Monthly fee, also the month's spendable usage credit. Enterprise's is a starting point. */
  feeCents: bigint;
  /** Units included every month, whatever the credit. */
  includedUnits: Readonly<Partial<Record<MeterKey, number>>>;
  /** `blocked`: usage stops at the included units (no payment method on file). */
  overage: "billed" | "blocked";
  /** Term of a new contract on this plan, in months (`null`: month to month). */
  termMonths: number | null;
  entitlements: Entitlements;
  /** Shown on the plan picker and in the docs. */
  highlights: readonly string[];
};

export const PLANS = {
  free: {
    key: "free",
    name: "Free",
    description: "For trying coss.com and side projects.",
    rank: 0,
    selfServe: true,
    feeCents: 0n,
    includedUnits: {
      "email.recipients": 3_000,
      "email.attachment_data": 1_000,
      "email.received": 3_000,
      "email.received_data": 1_000,
      "forms.submissions": 1_000,
      "forms.file_uploads": 1_000,
      "scheduling.bookings": 100,
      "email.inboxes": INBOX_DAYS_INCLUDED,
      "risk.phone_checks": PHONE_CHECKS_INCLUDED,
      "hooks.messages": HOOKS_MESSAGES_INCLUDED.free,
      "risk.assessments": RISK_ASSESSMENTS_INCLUDED.free,
      "risk.content_checks": RISK_CONTENT_CHECKS_INCLUDED.free,
      "scheduling.hosts": SCHEDULING_HOST_DAYS_INCLUDED.free,
    },
    overage: "blocked",
    termMonths: null,
    entitlements: {
      features: {
        trackingDomains: false,
        auditLog: false,
        logDrains: false,
        sso: false,
        scim: false,
        dedicatedIps: false,
        subaccounts: false,
        schedulingHolds: false,
        schedulingHostPortal: false,
        schedulingRouting: false,
        schedulingWhiteLabel: false,
      },
      limits: {
        domains: 1,
        members: 3,
        webhookEndpointsPerEnvironment: 2,
        contactsPerEnvironment: 1_000,
        smsNumbers: 0,
        inboxes: 3,
        subaccounts: 0,
        schedulingHosts: 3,
        schedulingSearchHosts: 5,
        schedulingGroupSeats: 10,
      },
      rateLimits: {
        "email.recipients.second": perSecond(2, 50),
        "email.recipients.day": perDay(3_000),
        "email.marketing.recipients.second": perSecond(2, 10),
        "email.inbound.megabytes.day": perDay(250),
        "sms.segments.second": perSecond(1, 5),
        "sms.segments.day": perDay(100),
        "risk.assess": perSecond(10, 50),
        "scheduling.slots.second": perSecond(5, 20),
      },
    },
    highlights: ["3,000 emails per month", "1 domain", "3 team members", "3 inboxes"],
  },
  pro: {
    key: "pro",
    name: "Pro",
    description: "For production apps. $25 a month, all of it spendable on usage.",
    rank: 1,
    selfServe: true,
    feeCents: 2_500n,
    includedUnits: {
      "email.inboxes": INBOX_DAYS_INCLUDED,
      "risk.phone_checks": PHONE_CHECKS_INCLUDED,
      "hooks.messages": HOOKS_MESSAGES_INCLUDED.pro,
      "risk.assessments": RISK_ASSESSMENTS_INCLUDED.pro,
      "risk.content_checks": RISK_CONTENT_CHECKS_INCLUDED.pro,
      "scheduling.hosts": SCHEDULING_HOST_DAYS_INCLUDED.pro,
    },
    overage: "billed",
    termMonths: null,
    entitlements: {
      features: {
        trackingDomains: true,
        auditLog: true,
        logDrains: false,
        sso: false,
        scim: false,
        dedicatedIps: false,
        subaccounts: false,
        schedulingHolds: true,
        schedulingHostPortal: false,
        schedulingRouting: false,
        schedulingWhiteLabel: false,
      },
      limits: {
        domains: 10,
        members: 10,
        webhookEndpointsPerEnvironment: 10,
        contactsPerEnvironment: 50_000,
        smsNumbers: 5,
        inboxes: 1_000,
        subaccounts: 0,
        schedulingHosts: 25,
        schedulingSearchHosts: 25,
        schedulingGroupSeats: 50,
      },
      rateLimits: {
        "email.recipients.second": perSecond(14, 100),
        "email.recipients.day": perDay(100_000),
        "email.marketing.recipients.second": perSecond(10, 50),
        "email.inbound.megabytes.day": perDay(10_000),
        "sms.segments.second": perSecond(10, 50),
        "sms.segments.day": perDay(10_000),
        "risk.assess": perSecond(100, 200),
        "scheduling.slots.second": perSecond(25, 100),
      },
    },
    highlights: [
      "$25 of usage included",
      "10 domains",
      "10 team members",
      "Custom tracking domains",
      "Audit log",
      "SMS",
    ],
  },
  scale: {
    key: "scale",
    name: "Scale",
    description: "For growing teams. $250 a month, all of it spendable on usage.",
    rank: 2,
    selfServe: true,
    feeCents: 25_000n,
    includedUnits: {
      "email.inboxes": INBOX_DAYS_INCLUDED,
      "risk.phone_checks": PHONE_CHECKS_INCLUDED,
      "hooks.messages": HOOKS_MESSAGES_INCLUDED.scale,
      "risk.assessments": RISK_ASSESSMENTS_INCLUDED.scale,
      "risk.content_checks": RISK_CONTENT_CHECKS_INCLUDED.scale,
      "scheduling.hosts": SCHEDULING_HOST_DAYS_INCLUDED.scale,
    },
    overage: "billed",
    termMonths: null,
    entitlements: {
      features: {
        trackingDomains: true,
        auditLog: true,
        logDrains: true,
        sso: true,
        scim: false,
        dedicatedIps: false,
        subaccounts: true,
        schedulingHolds: true,
        schedulingHostPortal: true,
        schedulingRouting: true,
        schedulingWhiteLabel: true,
      },
      limits: {
        domains: 100,
        members: null,
        webhookEndpointsPerEnvironment: 10,
        contactsPerEnvironment: 250_000,
        smsNumbers: 50,
        inboxes: 10_000,
        subaccounts: 1_000,
        schedulingHosts: null,
        schedulingSearchHosts: 500,
        schedulingGroupSeats: 10_000,
      },
      rateLimits: {
        "email.recipients.second": perSecond(50, 200),
        "email.recipients.day": perDay(1_000_000),
        "email.marketing.recipients.second": perSecond(50, 250),
        "email.inbound.megabytes.day": perDay(100_000),
        "sms.segments.second": perSecond(30, 150),
        "sms.segments.day": perDay(100_000),
        "risk.assess": perSecond(100, 200),
        "scheduling.slots.second": perSecond(100, 300),
      },
    },
    highlights: [
      "$250 of usage included",
      "100 domains",
      "Unlimited team members",
      "Log drains",
      "Single sign-on",
      "100 Scheduling hosts, more by the month",
    ],
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    description: "Annual commitments, custom pricing and terms. From $2,000 a month.",
    rank: 3,
    selfServe: false,
    feeCents: 200_000n,
    includedUnits: {
      "email.inboxes": INBOX_DAYS_INCLUDED,
      "risk.phone_checks": PHONE_CHECKS_INCLUDED,
      "hooks.messages": HOOKS_MESSAGES_INCLUDED.enterprise,
      "risk.assessments": RISK_ASSESSMENTS_INCLUDED.enterprise,
      "risk.content_checks": RISK_CONTENT_CHECKS_INCLUDED.enterprise,
      "scheduling.hosts": SCHEDULING_HOST_DAYS_INCLUDED.enterprise,
    },
    overage: "billed",
    termMonths: 12,
    entitlements: {
      features: {
        trackingDomains: true,
        auditLog: true,
        logDrains: true,
        sso: true,
        scim: true,
        dedicatedIps: false,
        subaccounts: true,
        schedulingHolds: true,
        schedulingHostPortal: true,
        schedulingRouting: true,
        schedulingWhiteLabel: true,
      },
      limits: {
        domains: null,
        members: null,
        webhookEndpointsPerEnvironment: 10,
        contactsPerEnvironment: null,
        smsNumbers: null,
        inboxes: null,
        subaccounts: null,
        schedulingHosts: null,
        schedulingSearchHosts: 500,
        schedulingGroupSeats: 10_000,
      },
      rateLimits: {
        "email.recipients.second": perSecond(100, 500),
        "email.recipients.day": perDay(5_000_000),
        "email.marketing.recipients.second": perSecond(100, 500),
        "email.inbound.megabytes.day": perDay(500_000),
        "sms.segments.second": perSecond(100, 500),
        "sms.segments.day": perDay(1_000_000),
        "risk.assess": perSecond(100, 200),
        "scheduling.slots.second": perSecond(200, 1000),
      },
    },
    highlights: [
      "Volume pricing and commitments",
      "Directory sync (SCIM)",
      "HIPAA mode with a signed BAA",
      "Invoicing and direct debit",
    ],
  },
} as const satisfies Record<PlanKey, PlanDefinition>;

export function isPlanKey(value: string): value is PlanKey {
  return Object.hasOwn(PLANS, value);
}

export function planDefinition(key: PlanKey): PlanDefinition {
  return PLANS[key];
}

export const SELF_SERVE_PLANS: readonly PlanKey[] = PLAN_KEYS.filter((key) => PLANS[key].selfServe);
