/**
 * What support each plan gets: the one source for the pricing page, the docs, the dashboard and
 * the SLA clock. Targets are published as targets; only a written agreement makes them binding.
 */
import type { PlanKey } from "./plans.ts";

/** When the clock runs, unless a contract's `support.allHours` says always. */
export const SUPPORT_HOURS = {
  timeZone: "America/Chicago",
  /** ISO weekdays: Monday is 1. */
  weekdays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
  label: "Monday to Friday, 9am to 6pm Central Time",
} as const;

export const SUPPORT_BUSINESS_DAY_MINUTES = (SUPPORT_HOURS.endHour - SUPPORT_HOURS.startHour) * 60;

export const SUPPORT_SEVERITIES = ["normal", "urgent"] as const;
export type SupportSeverity = (typeof SUPPORT_SEVERITIES)[number];

export type SupportTier = {
  plan: PlanKey;
  /** Clock minutes to a response. `urgent: null`: the plan has no urgent option. */
  responseMinutes: { normal: number; urgent: number | null };
  /** Ahead of lower plans when due at the same moment. */
  frontOfQueue: boolean;
  channels: readonly string[];
};

const STANDARD_CHANNELS = ["Email", "Dashboard"] as const;

export const SUPPORT_TIERS: Record<PlanKey, SupportTier> = {
  free: {
    plan: "free",
    responseMinutes: { normal: 3 * SUPPORT_BUSINESS_DAY_MINUTES, urgent: null },
    frontOfQueue: false,
    channels: STANDARD_CHANNELS,
  },
  pro: {
    plan: "pro",
    responseMinutes: { normal: SUPPORT_BUSINESS_DAY_MINUTES, urgent: 4 * 60 },
    frontOfQueue: false,
    channels: STANDARD_CHANNELS,
  },
  scale: {
    plan: "scale",
    responseMinutes: { normal: 4 * 60, urgent: 60 },
    frontOfQueue: true,
    channels: STANDARD_CHANNELS,
  },
  enterprise: {
    plan: "enterprise",
    responseMinutes: { normal: 2 * 60, urgent: 60 },
    frontOfQueue: true,
    channels: [...STANDARD_CHANNELS, "Shared Slack channel", "Named contact"],
  },
};

/** The minutes a ticket has to a response; a plan without urgent support answers as normal. */
export function supportResponseMinutes(plan: PlanKey, severity: SupportSeverity): number {
  const { normal, urgent } = SUPPORT_TIERS[plan].responseMinutes;
  return severity === "urgent" ? (urgent ?? normal) : normal;
}

/** "3 business days", "4 business hours"; `allHours` drops "business" (the clock never stops). */
export function formatSupportTarget(minutes: number, options?: { allHours?: boolean }): string {
  const qualifier = options?.allHours ? "" : "business ";
  if (!options?.allHours && minutes % SUPPORT_BUSINESS_DAY_MINUTES === 0) {
    const days = minutes / SUPPORT_BUSINESS_DAY_MINUTES;
    return `${days} ${qualifier}${days === 1 ? "day" : "days"}`;
  }
  const hours = minutes / 60;
  return `${hours} ${qualifier}${hours === 1 ? "hour" : "hours"}`;
}
