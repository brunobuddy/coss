import type { SchedulingEventType } from "@coss/companion";
import { Stack, useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge } from "../../../../../../../../../components/badge";
import { Icon } from "../../../../../../../../../components/icon";
import { Panel, SpecItem, SpecList } from "../../../../../../../../../components/panel";
import { ProductGlyph } from "../../../../../../../../../components/product-glyph";
import { Screen } from "../../../../../../../../../components/screen";
import { Text } from "../../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../../components/web-button";
import { formatDuration } from "../../../../../../../../../lib/format-scheduling";
import { useSchedulingEventType } from "../../../../../../../../../lib/queries-scheduling";
import {
  EVENT_TYPE_KIND_ICONS,
  EVENT_TYPE_KIND_LABELS,
  LOCATION_LABELS,
} from "../../../../../../../../../lib/status-scheduling";
import { space } from "../../../../../../../../../lib/theme";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../../lib/web";

function minutes(value: number): string {
  return value === 0 ? "None" : formatDuration(value);
}

export default function EventTypeScreen() {
  const { eventTypeId, ...params } = useLocalSearchParams<
    EnvironmentParams & { eventTypeId: string }
  >();
  const query = useSchedulingEventType(params, eventTypeId);
  const options = <Stack.Screen options={{ title: "Event type" }} />;
  if (query.isPending) return <Screen loading="detail">{options}</Screen>;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const eventType = query.data as SchedulingEventType;
  return (
    <Screen onRefresh={() => query.refetch()}>
      {options}
      <WebButton path={`${environmentPath(params)}/scheduling/event-types`} />
      <View style={styles.identity}>
        <ProductGlyph icon={EVENT_TYPE_KIND_ICONS[eventType.kind]} size={44} tone="scheduling" />
        <View style={styles.identityText}>
          <Text selectable variant="title">
            {eventType.title}
          </Text>
          <View style={styles.meta}>
            <Badge variant="outline">{EVENT_TYPE_KIND_LABELS[eventType.kind]}</Badge>
            {eventType.status === "archived" ? <Badge variant="neutral">Archived</Badge> : null}
          </View>
        </View>
      </View>
      <Panel title="Booking">
        <SpecList>
          <SpecItem label="Length">{formatDuration(eventType.duration_minutes)}</SpecItem>
          {eventType.duration_options.length > 1 ? (
            <SpecItem label="Options">
              {eventType.duration_options.map(formatDuration).join(", ")}
            </SpecItem>
          ) : null}
          <SpecItem label="Starts every">{formatDuration(eventType.step_minutes)}</SpecItem>
          <SpecItem label="Hosts">{String(eventType.hosts)}</SpecItem>
          {eventType.capacity !== null ? (
            <SpecItem label="Seats">{String(eventType.capacity)}</SpecItem>
          ) : null}
          <SpecItem label="Where">
            {eventType.locations.length > 0
              ? eventType.locations.map((type) => LOCATION_LABELS[type]).join(", ")
              : "—"}
          </SpecItem>
        </SpecList>
      </Panel>
      <Panel title="Rules">
        <SpecList>
          <SpecItem label="Needs approval">
            {eventType.requires_approval ? (
              <View style={styles.approval}>
                <Icon color="successForeground" icon={Check} size={14} strokeWidth={2.25} />
                <Text variant="small">Within {formatDuration(eventType.approval_ttl_minutes)}</Text>
              </View>
            ) : (
              "No"
            )}
          </SpecItem>
          <SpecItem label="Minimum notice">{minutes(eventType.min_notice_minutes)}</SpecItem>
          <SpecItem label="Cancellation notice">
            {minutes(eventType.cancel_notice_minutes)}
          </SpecItem>
          <SpecItem label="Buffer before">{minutes(eventType.buffer_before_minutes)}</SpecItem>
          <SpecItem label="Buffer after">{minutes(eventType.buffer_after_minutes)}</SpecItem>
        </SpecList>
      </Panel>
      {eventType.uid ? (
        <Panel>
          <SpecList>
            <SpecItem label="UID" mono>
              {eventType.uid}
            </SpecItem>
            <SpecItem label="ID" mono>
              {eventType.id}
            </SpecItem>
          </SpecList>
        </Panel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: space.md },
  identityText: { flex: 1, gap: space.xs },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  approval: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
