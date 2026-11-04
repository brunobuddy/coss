import { useLocalSearchParams } from "expo-router";
import { Scale } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { EmptyState } from "../../../../../../../../components/empty";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { Panel, Ruled } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Stat, StatGrid } from "../../../../../../../../components/stat";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatCount } from "../../../../../../../../lib/format";
import { useRiskCalibration } from "../../../../../../../../lib/queries-risk-settings";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy and formats from apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/risk/calibration/page.tsx.
// Read-only: suggested weights are applied (or reset) on coss.com.
const percent = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)}%`);
const weight = (value: number) => value.toFixed(2);

export default function RiskCalibrationScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useRiskCalibration(params);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const calibration = query.data;
  const changed = calibration.reasons.filter(
    (reason) => reason.suggested_weight !== null && reason.suggested_weight !== reason.weight,
  ).length;
  return (
    <Screen onRefresh={() => query.refetch()} title="Calibration">
      <WebButton path={`${environmentPath(params)}/risk/calibration`} />
      <PageIntro
        description={`What your feedback says about each reason and rule over the last ${calibration.window_days} days. Weights only change when you apply them.`}
        meta={<ModeBadge params={params} />}
        title="Calibration"
      />
      <StatGrid>
        <Stat key="assessments" label="Assessments" value={formatCount(calibration.assessments)} />
        <Stat
          detail={percent(
            calibration.assessments ? calibration.labeled / calibration.assessments : null,
          )}
          key="labeled"
          label="With feedback"
          value={formatCount(calibration.labeled)}
        />
        <Stat key="reasons" label="Reasons that fired" value={String(calibration.reasons.length)} />
        <Stat key="suggestions" label="Suggestions" value={String(changed)} />
      </StatGrid>
      <Panel
        footer={`A reason needs feedback on ${calibration.min_feedback} assessments before a weight is suggested; until there's plenty, suggestions stay near the default. Feedback given mostly on reviews and blocks over-represents them: read precision as a guide.`}
        title="Reasons"
      >
        {calibration.reasons.length === 0 ? (
          <EmptyState
            description="Once assessments come in and you send feedback on them, each reason's track record shows here."
            icon={Scale}
            title="Nothing to calibrate yet"
          />
        ) : (
          <Ruled>
            {calibration.reasons.map((reason) => {
              const custom = reason.weight !== reason.default_weight;
              return (
                <View key={reason.code} style={styles.reason}>
                  <Text selectable style={styles.code} variant="mono">
                    {reason.code}
                  </Text>
                  <View style={styles.cells}>
                    <Cell label="Fired" value={formatCount(reason.fired)} />
                    <Cell label="Fraud" value={formatCount(reason.fraud)} />
                    <Cell label="Legitimate" value={formatCount(reason.legitimate)} />
                  </View>
                  <View style={styles.cells}>
                    <Cell label="Precision" value={percent(reason.precision)} />
                    <Cell
                      detail={custom ? `default ${weight(reason.default_weight)}` : undefined}
                      label="Weight"
                      value={weight(reason.weight)}
                    />
                    <Cell
                      label="Suggested"
                      value={
                        reason.suggested_weight === null ? "–" : weight(reason.suggested_weight)
                      }
                    />
                  </View>
                </View>
              );
            })}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}

/** One of the dashboard table's columns: its header over the value. */
function Cell(props: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.cell}>
      <Text muted variant="small">
        {props.label}
      </Text>
      <Text muted={props.value === "–"} variant="mono">
        {props.value}
      </Text>
      {props.detail ? (
        <Text muted variant="mono">
          {props.detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  reason: { gap: 8, padding: 16 },
  code: { fontSize: 13 },
  cells: { flexDirection: "row", gap: 12 },
  cell: { flex: 1, gap: 2 },
});
