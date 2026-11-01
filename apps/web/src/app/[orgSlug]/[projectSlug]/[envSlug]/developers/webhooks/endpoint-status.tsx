import type { WebhookEndpointRow } from "@coss/webhooks";
import { StatusDot } from "@/components/status-dot";

export function EndpointStatusBadge({
  endpoint,
}: {
  endpoint: Pick<WebhookEndpointRow, "enabled" | "disabledReason" | "failingSince">;
}) {
  if (endpoint.enabled) {
    return endpoint.failingSince ? (
      <StatusDot tone="warning">Failing</StatusDot>
    ) : (
      <StatusDot tone="success">Enabled</StatusDot>
    );
  }
  if (endpoint.disabledReason === "failing") {
    return <StatusDot tone="error">Disabled: failing</StatusDot>;
  }
  return <StatusDot tone="neutral">Disabled</StatusDot>;
}
