import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { Stack, useLocalSearchParams } from "expo-router";
import { Send } from "lucide-react-native";
import { Alert } from "../../../../../../../../../../components/alert";
import { Badge, StatusDot } from "../../../../../../../../../../components/badge";
import { PagedPanel } from "../../../../../../../../../../components/paged";
import { ListRow, Panel, SpecItem, SpecList } from "../../../../../../../../../../components/panel";
import {
  ErrorState,
  Loading,
  PageIntro,
  Screen,
} from "../../../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../../../components/web-button";
import { formatAgo, formatDateTime, plural } from "../../../../../../../../../../lib/format";
import { useHookEndpoint } from "../../../../../../../../../../lib/queries";
import { endpointStatus, HOOK_DELIVERY_STATUS } from "../../../../../../../../../../lib/status";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../../../lib/web";

// DISABLE_FAILING_ENDPOINT_AFTER_MS in @coss/webhooks/engine.
const DISABLED_AFTER_DAYS = 5;

export default function HookEndpointScreen() {
  const { applicationId, endpointId, ...params } = useLocalSearchParams<
    EnvironmentParams & { applicationId: string; endpointId: string }
  >();
  const query = useHookEndpoint(params, applicationId, endpointId);
  if (query.isPending) return <Loading />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const first = query.data.pages[0];
  if (!first) return <Loading />;
  const { application, endpoint, last_recovery } = first;
  const deliveries = query.data.pages.flatMap((page) => page.deliveries.data);
  const [tone, label] = endpointStatus(endpoint);
  return (
    <Screen onRefresh={() => query.refetch()}>
      <Stack.Screen
        options={{
          title: "Endpoint",
          headerRight: () => (
            <WebButton
              path={`${environmentPath(params)}/hooks/${application.id}/endpoints/${endpoint.id}`}
            />
          ),
        }}
      />
      <PageIntro
        description={endpoint.description ?? undefined}
        meta={
          <Badge variant="outline">
            <StatusDot label={label} tone={tone} />
          </Badge>
        }
        mono
        title={endpoint.url}
      />
      {!endpoint.enabled && endpoint.disabled_reason === "failing" ? (
        <Alert
          description={`Every delivery to this endpoint failed for ${DISABLED_AFTER_DAYS} days, so coss.com disabled it${endpoint.disabled_at ? ` on ${formatDateTime(endpoint.disabled_at)}` : ""}. Enable it again once its receiver works, then recover what it missed.`}
          title="Disabled after repeated failures"
          tone="error"
        />
      ) : null}
      {endpoint.enabled && endpoint.failing_since ? (
        <Alert
          description={`If no delivery succeeds for ${DISABLED_AFTER_DAYS} days, coss.com disables the endpoint.`}
          title={`Failing since ${formatDateTime(endpoint.failing_since)}`}
          tone="warning"
        />
      ) : null}
      <Panel title="Details">
        <SpecList>
          <SpecItem label="Application">{application.name}</SpecItem>
          <SpecItem label="Event types" stacked={endpoint.filter_types.length > 0}>
            {endpoint.filter_types.length === 0 ? "All" : endpoint.filter_types.join(", ")}
          </SpecItem>
          <SpecItem label="Rate limit" mono>
            {endpoint.rate_limit_per_second ? `${endpoint.rate_limit_per_second}/s` : "Default"}
          </SpecItem>
          <SpecItem label="Created" mono>
            {formatDateTime(endpoint.created_at)}
          </SpecItem>
          {last_recovery ? (
            <SpecItem label="Last recovery" mono>
              {`${formatDateTime(last_recovery.created_at)} · ${last_recovery.requeued} requeued${last_recovery.running ? ", running" : ""}`}
            </SpecItem>
          ) : null}
        </SpecList>
      </Panel>
      <PagedPanel
        description={`Failed deliveries are retried for about a day (8 attempts). Kept for ${formatRetentionDays(RETENTION_DAYS.hookMessages)}.`}
        empty={{
          icon: Send,
          title: "No deliveries yet",
          description: "Messages sent to this endpoint's application show up here.",
        }}
        items={deliveries}
        olderLabel="Older deliveries"
        query={query}
        render={(delivery) => {
          const [deliveryTone, deliveryLabel] = HOOK_DELIVERY_STATUS[delivery.status] ?? [
            "neutral",
            delivery.status,
          ];
          return (
            <ListRow
              detail={formatAgo(delivery.created_at)}
              href={{
                pathname:
                  "/[org]/projects/[project]/[env]/hooks/[applicationId]/messages/[messageId]",
                params: {
                  ...params,
                  applicationId: application.id,
                  messageId: delivery.message_id,
                },
              }}
              key={delivery.id}
              leading={<StatusDot tone={deliveryTone} />}
              subtitle={`${deliveryLabel} · ${plural(delivery.attempt_count, "attempt")} · ${delivery.last_status_code ? `HTTP ${delivery.last_status_code}` : (delivery.last_error ?? "—")}`}
              title={delivery.message_id}
            />
          );
        }}
        title="Recent deliveries"
      />
    </Screen>
  );
}
