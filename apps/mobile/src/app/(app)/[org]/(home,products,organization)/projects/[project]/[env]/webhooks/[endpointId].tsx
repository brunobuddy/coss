import type { RecoverRequest, WebhookDelivery } from "@coss/companion";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams } from "expo-router";
import { History, RotateCw, Send } from "lucide-react-native";
import { useState } from "react";
import { ActionSheetIOS, Alert as NativeAlert, Pressable, StyleSheet, View } from "react-native";
import { Alert } from "../../../../../../../../components/alert";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import { Button } from "../../../../../../../../components/button";
import { type Filter, FilterChips } from "../../../../../../../../components/filters";
import { PagedPanel } from "../../../../../../../../components/paged";
import { Panel, SpecItem, SpecList } from "../../../../../../../../components/panel";
import { ErrorState, Loading, PageIntro, Screen } from "../../../../../../../../components/screen";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo, formatDateTime } from "../../../../../../../../lib/format";
import {
  ApiRequestError,
  useRecoverEndpoint,
  useRetryDelivery,
  useSetEndpointEnabled,
  useWebhookEndpoint,
} from "../../../../../../../../lib/queries";
import { DELIVERY_STATUS, endpointStatus } from "../../../../../../../../lib/status";
import { colors } from "../../../../../../../../lib/theme";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// DISABLE_FAILING_ENDPOINT_AFTER_MS in @coss/webhooks/engine.
const DISABLED_AFTER_DAYS = 5;

type Status = "failed" | "succeeded" | "pending";
const FILTERS: Filter<Status>[] = [
  { value: null, label: "All" },
  { value: "failed", label: "Failed", tone: "error" },
  { value: "succeeded", label: "Succeeded", tone: "success" },
  { value: "pending", label: "Pending", tone: "warning" },
];

/** The dashboard's "last result" column. */
function lastResult(delivery: WebhookDelivery): string {
  const last = delivery.attempts.at(-1);
  if (!last) return "Not attempted yet";
  const outcome = last.status_code ? `HTTP ${last.status_code}` : (last.error ?? "Failed");
  return `${outcome} in ${last.duration_ms} ms`;
}

function DeliveryRow(props: {
  delivery: WebhookDelivery;
  canRetry: boolean;
  onRetry: (id: string) => Promise<unknown>;
}) {
  const { delivery } = props;
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [tone, label] = DELIVERY_STATUS[delivery.status] ?? ["neutral", delivery.status];
  const retry = () =>
    NativeAlert.alert(
      "Retry this delivery?",
      "coss.com queues it to be sent to the endpoint again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Retry",
          onPress: async () => {
            setRetrying(true);
            try {
              await props.onRetry(delivery.id);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              NativeAlert.alert(
                "Couldn't retry",
                error instanceof ApiRequestError ? error.message : "Try again.",
              );
            } finally {
              setRetrying(false);
            }
          },
        },
      ],
    );
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)}>
        {({ pressed }) => (
          <View style={[styles.row, pressed && styles.pressed]}>
            <StatusDot tone={tone} />
            <View style={styles.rowText}>
              <Text numberOfLines={1} variant="mono">
                {delivery.event_type}
              </Text>
              <Text muted numberOfLines={1} variant="small">
                {label} · {lastResult(delivery)}
              </Text>
            </View>
            <Text muted variant="mono">
              {formatAgo(delivery.created_at)}
            </Text>
          </View>
        )}
      </Pressable>
      {open ? (
        <View style={styles.detail}>
          <SpecItem label="Event" mono stacked>
            {delivery.event_id}
          </SpecItem>
          <SpecItem label="Attempts" mono>
            {String(delivery.attempt_count)}
          </SpecItem>
          {delivery.next_attempt_at ? (
            <SpecItem label="Next attempt" mono>
              {formatDateTime(delivery.next_attempt_at)}
            </SpecItem>
          ) : null}
          {delivery.attempts.map((attempt, index) => (
            <View key={attempt.id} style={styles.attempt}>
              <Badge
                mono
                variant={attempt.status_code && attempt.status_code < 300 ? "success" : "error"}
              >
                {attempt.status_code ? String(attempt.status_code) : "error"}
              </Badge>
              <Text muted style={styles.attemptText} variant="mono">
                #{index + 1} · {formatDateTime(attempt.attempted_at)} · {attempt.duration_ms} ms
                {attempt.error ? `\n${attempt.error}` : ""}
              </Text>
            </View>
          ))}
          {props.canRetry && delivery.status !== "pending" ? (
            <Button
              icon={RotateCw}
              loading={retrying}
              onPress={retry}
              size="sm"
              title="Retry"
              variant="outline"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// The dashboard's RecoverDeliveriesButton (webhooks/[endpointId]/endpoint-actions.tsx).
const RECOVER_PERIODS: { label: string; hours: RecoverRequest["since_hours"] }[] = [
  { label: "The last hour", hours: 1 },
  { label: "The last 24 hours", hours: 24 },
  { label: "The last 7 days", hours: 168 },
  { label: "The last 30 days", hours: 720 },
];

function RecoverButton(props: { params: EnvironmentParams; endpointId: string }) {
  const recover = useRecoverEndpoint(props.params, props.endpointId);
  const run = (hours: RecoverRequest["since_hours"]) =>
    recover.mutate(hours, {
      onSuccess: ({ requeued, has_more }) => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (requeued === 0) {
          NativeAlert.alert("No failed deliveries", "Nothing failed in that period.");
          return;
        }
        NativeAlert.alert(
          `${requeued} ${requeued === 1 ? "delivery" : "deliveries"} queued`,
          `Each gets one more attempt within the next minute.${has_more ? " More failed in that period: recover again to queue the rest." : ""}`,
        );
      },
      onError: (error) =>
        NativeAlert.alert(
          "Couldn't recover deliveries",
          error instanceof ApiRequestError ? error.message : "Try again.",
        ),
    });
  return (
    <Button
      icon={History}
      loading={recover.isPending}
      onPress={() =>
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: "Recover failed deliveries?",
            message:
              "Deliveries that failed every attempt are sent once more, to the endpoint's current URL and signed with its current secret. Use this after fixing a receiver that was down.",
            options: [...RECOVER_PERIODS.map((period) => period.label), "Cancel"],
            cancelButtonIndex: RECOVER_PERIODS.length,
          },
          (index) => {
            const period = RECOVER_PERIODS[index];
            if (period) run(period.hours);
          },
        )
      }
      size="sm"
      title="Recover failed"
      variant="outline"
    />
  );
}

// The dashboard's ToggleEndpointButton (webhooks/[endpointId]/endpoint-actions.tsx).
function ToggleButton(props: { params: EnvironmentParams; endpointId: string; enabled: boolean }) {
  const toggle = useSetEndpointEnabled(props.params, props.endpointId);
  return (
    <Button
      loading={toggle.isPending}
      onPress={() =>
        toggle.mutate(!props.enabled, {
          onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
          onError: (error) =>
            NativeAlert.alert(
              props.enabled ? "Couldn't disable the endpoint" : "Couldn't enable the endpoint",
              error instanceof ApiRequestError ? error.message : "Try again.",
            ),
        })
      }
      size="sm"
      title={props.enabled ? "Disable" : "Enable"}
      variant="outline"
    />
  );
}

export default function WebhookEndpointScreen() {
  const { endpointId, ...params } = useLocalSearchParams<
    EnvironmentParams & { endpointId: string }
  >();
  const [status, setStatus] = useState<Status | null>(null);
  const query = useWebhookEndpoint(params, endpointId, status);
  const retry = useRetryDelivery(params, endpointId);
  if (query.isPending) return <Loading />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const first = query.data.pages[0];
  if (!first) return <Loading />;
  const { endpoint, can_update } = first;
  const deliveries = query.data.pages.flatMap((page) => page.deliveries.data);
  const [tone, label] = endpointStatus(endpoint);
  return (
    <Screen onRefresh={() => query.refetch()}>
      <Stack.Screen
        options={{
          title: "Endpoint",
          headerRight: () => (
            <WebButton path={`${environmentPath(params)}/webhooks/${endpoint.id}`} />
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
          description={`Every delivery to this endpoint failed for ${DISABLED_AFTER_DAYS} days, so coss.com disabled it${endpoint.disabled_at ? ` on ${formatDateTime(endpoint.disabled_at)}` : ""}. Fix the receiver, enable the endpoint again, then recover the deliveries it missed.`}
          title="Disabled after repeated failures"
          tone="error"
        />
      ) : null}
      {endpoint.enabled && endpoint.failing_since ? (
        <Alert
          description={`Deliveries to this endpoint have been failing every attempt. If none succeeds for ${DISABLED_AFTER_DAYS} days, coss.com disables the endpoint.`}
          title={`Failing since ${formatDateTime(endpoint.failing_since)}`}
          tone="warning"
        />
      ) : null}
      <Panel title="Details">
        <SpecList>
          <SpecItem label="Events" stacked={endpoint.event_types.length > 0}>
            {endpoint.event_types.length === 0 ? "All events" : endpoint.event_types.join(", ")}
          </SpecItem>
          <SpecItem label="API version" mono>
            {endpoint.api_version}
          </SpecItem>
          <SpecItem label="Created" mono>
            {formatDateTime(endpoint.created_at)}
          </SpecItem>
        </SpecList>
      </Panel>
      {can_update ? (
        <View style={styles.actions}>
          {endpoint.enabled ? (
            <View style={styles.action}>
              <RecoverButton endpointId={endpoint.id} params={params} />
            </View>
          ) : null}
          <View style={styles.action}>
            <ToggleButton enabled={endpoint.enabled} endpointId={endpoint.id} params={params} />
          </View>
        </View>
      ) : null}
      <FilterChips items={FILTERS} onChange={setStatus} value={status} />
      <PagedPanel
        description="Tap a delivery for its attempts."
        empty={
          status
            ? {
                icon: Send,
                title: "Nothing found",
                description: "No delivery matches this filter.",
              }
            : {
                icon: Send,
                title: "No deliveries yet",
                description: "Deliveries appear here once events of the subscribed types happen.",
              }
        }
        items={deliveries}
        olderLabel="Older deliveries"
        // While another filter loads, the previous one's rows stay in `data`: show the spinner.
        query={query.isPlaceholderData ? { ...query, isPending: true } : query}
        render={(delivery) => (
          <DeliveryRow
            canRetry={can_update}
            delivery={delivery}
            key={delivery.id}
            onRetry={(id) => retry.mutateAsync(id)}
          />
        )}
        title="Deliveries"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pressed: { backgroundColor: colors.muted },
  rowText: { flex: 1, gap: 2 },
  detail: { gap: 8, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: colors.muted },
  attempt: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  attemptText: { flex: 1 },
});
