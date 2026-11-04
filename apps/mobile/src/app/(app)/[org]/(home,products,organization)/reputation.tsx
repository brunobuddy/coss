import type { ReputationCheck } from "@coss/companion";
import { useLocalSearchParams } from "expo-router";
import { History } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../../../components/alert";
import { Badge, StatusDot } from "../../../../components/badge";
import { EmptyState } from "../../../../components/empty";
import { ListRow, Panel, Ruled } from "../../../../components/panel";
import { PageIntro, Screen } from "../../../../components/screen";
import { Text } from "../../../../components/text";
import { formatCount, formatDateTime, formatRate } from "../../../../lib/format";
import { useReputation } from "../../../../lib/queries";
import { STANDING_LABELS, standingTone } from "../../../../lib/status";
import { colors } from "../../../../lib/theme";

const EVENT_LABELS = {
  warning_raised: "Warning raised",
  warning_cleared: "Warning cleared",
  suspended: "Suspended",
  reinstated: "Reinstated",
  marketing_paused: "Marketing paused",
  marketing_reinstated: "Marketing resumed",
} as const;

/** One measurement against its thresholds (the dashboard's `ReputationChecks` row). */
function Check({ check }: { check: ReputationCheck }) {
  if (check.rate === null && check.suspend_threshold === null) {
    return (
      <View style={styles.check}>
        <Text variant="label">{check.trigger_label}</Text>
        <Text muted variant="small">
          {check.message}
        </Text>
      </View>
    );
  }
  const ceiling = check.suspend_threshold ?? 1;
  const percent = Math.min(100, ((check.rate ?? 0) / (ceiling || 1)) * 100);
  const fill =
    check.severity === "suspend"
      ? colors.destructive
      : check.severity === "warning"
        ? colors.warning
        : colors.success;
  const unit = check.trigger === "hook_failure_rate" ? "deliveries" : "recipients";
  return (
    <View style={styles.check}>
      <View style={styles.checkHead}>
        <Text style={styles.checkLabel} variant="label">
          {check.trigger_label}
        </Text>
        <Text muted variant="mono">
          {formatCount(check.count)} of {formatCount(check.volume)}
        </Text>
      </View>
      <Text variant="value">{formatRate(check.rate)}</Text>
      <View
        accessibilityLabel={`${check.trigger_label} relative to the suspension threshold`}
        style={styles.track}
      >
        <View style={[styles.indicator, { width: `${percent}%`, backgroundColor: fill }]} />
        {check.warning_threshold !== null && check.suspend_threshold ? (
          <View
            style={[
              styles.tick,
              { left: `${Math.min(100, (check.warning_threshold / ceiling) * 100)}%` },
            ]}
          />
        ) : null}
      </View>
      <Text muted variant="mono">
        warn {formatRate(check.warning_threshold)} ·{" "}
        {check.suspend_threshold === null
          ? "never suspends"
          : `suspend ${formatRate(check.suspend_threshold)}`}
        {check.minimum_volume ? ` · from ${formatCount(check.minimum_volume)} ${unit}` : ""}
      </Text>
      <Text muted variant="small">
        {check.message}
      </Text>
    </View>
  );
}

export default function ReputationScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const query = useReputation(org);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { standing, sending_paused, events } = query.data;

  return (
    <Screen onRefresh={() => query.refetch()} title="Reputation">
      <PageIntro
        title="Reputation"
        description="coss.com watches the bounce and complaint rates of your live sending and suspends it automatically when they get too high, to protect deliverability for everyone. Sandbox sending is never affected."
        meta={
          <Badge variant="outline">
            <StatusDot
              label={STANDING_LABELS[standing.status]}
              tone={standingTone(standing.status)}
            />
          </Badge>
        }
      />
      {sending_paused ? (
        <Alert
          description="Amazon SES paused this organization's sending. Contact support to resume it."
          title="Sending is paused"
          tone="error"
        />
      ) : null}
      <Panel
        description={
          standing.window
            ? `Live environments, ${formatDateTime(standing.window.start)} – ${formatDateTime(standing.window.end)}. Measured ${formatDateTime(standing.evaluated_at)}.`
            : "Not measured yet: rates are computed once live emails bounce or get complaints."
        }
        title="Sending rates"
      >
        {standing.checks.length > 0 ? (
          <Ruled>
            {standing.checks.map((check) => (
              <Check check={check} key={check.trigger} />
            ))}
          </Ruled>
        ) : null}
      </Panel>
      <Panel title="History">
        {events.length === 0 ? (
          <EmptyState
            description="Warnings, suspensions and reinstatements are listed here."
            icon={History}
            title="No changes yet"
          />
        ) : (
          <Ruled>
            {events.map((event) => (
              <ListRow
                detail={formatDateTime(event.created_at)}
                key={event.id}
                subtitle={`${event.trigger_label} · ${event.actor === "automatic" ? "Automatic" : "coss.com"}`}
                title={EVENT_LABELS[event.type]}
              />
            ))}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  check: { gap: 8, paddingHorizontal: 16, paddingVertical: 16 },
  checkHead: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  checkLabel: { flex: 1 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  indicator: { height: "100%", borderRadius: 3 },
  tick: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.background,
  },
});
