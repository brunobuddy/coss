import type { BroadcastStatus } from "@coss/companion";
import type { Tone } from "./theme";

// Mirrors BroadcastStatusBadge in apps/web/src/components/marketing.tsx.
export const BROADCAST_STATUS_LABELS: Record<BroadcastStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
  canceled: "Canceled",
  failed: "Failed",
};

export const BROADCAST_STATUS_TONE: Record<BroadcastStatus, Tone> = {
  draft: "neutral",
  scheduled: "info",
  sending: "info",
  paused: "warning",
  sent: "success",
  canceled: "neutral",
  failed: "error",
};

// PAUSE_REASONS of apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/broadcasts/[broadcastId]/page.tsx.
const PAUSE_REASONS: Record<string, string> = {
  paused: "You paused it.",
  billing_hold: "A billing hold pauses sending; it resumes on its own once the hold is lifted.",
  usage_limit: "Your plan's included emails are used up; it resumes when there is room again.",
  sending_paused: "Sending is paused for this organization; it resumes on its own once lifted.",
  marketing_paused:
    "Marketing email is paused for this organization (complaint or bounce rates). Resume it once coss.com lifts the pause.",
  account_suspended: "This organization is suspended. Resume it once the suspension is lifted.",
  mailing_address_required: "The postal address was removed from the marketing settings.",
};

export function pauseReasonText(reason: string): string {
  return PAUSE_REASONS[reason] ?? reason;
}
