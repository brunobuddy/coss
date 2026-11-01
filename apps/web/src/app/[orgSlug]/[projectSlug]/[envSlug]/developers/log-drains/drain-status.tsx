import type { LogDrainRow } from "@coss/webhooks";
import { StatusDot } from "@/components/status-dot";

export function DrainStatusBadge({
  drain,
}: {
  drain: Pick<LogDrainRow, "enabled" | "disabledReason">;
}) {
  if (drain.enabled) return <StatusDot tone="success">Enabled</StatusDot>;
  if (drain.disabledReason === "failing") {
    return <StatusDot tone="error">Disabled: failing</StatusDot>;
  }
  return <StatusDot tone="neutral">Disabled</StatusDot>;
}
