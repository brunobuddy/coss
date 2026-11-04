import { useLocalSearchParams } from "expo-router";
import { Gauge } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { StatusDot } from "../../../../../../../../components/badge";
import { EmptyState } from "../../../../../../../../components/empty";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { Panel, Ruled } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatCount } from "../../../../../../../../lib/format";
import { useRiskLimitBuckets } from "../../../../../../../../lib/queries-risk-settings";
import { bucketRate, ON_FAILURE } from "../../../../../../../../lib/status-risk-settings";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/risk/limits/page.tsx.
// Read-only: buckets are created, edited and deleted on coss.com.
export default function RiskLimitsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useRiskLimitBuckets(params);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  return (
    <Screen onRefresh={() => query.refetch()} title="Rate limits">
      <WebButton path={`${environmentPath(params)}/risk/limits`} />
      <PageIntro
        description="Your own rate limits: coss.risk.limit({ bucket, key }) takes a token from that key's share of a bucket and says whether to let the request through."
        meta={<ModeBadge params={params} />}
        title="Rate limits"
      />
      <Panel>
        {query.data.data.length === 0 ? (
          <EmptyState
            description="Limit password resets per address, sign-ups per IP, or anything else per key."
            icon={Gauge}
            title="No buckets yet"
          />
        ) : (
          <Ruled>
            {query.data.data.map((bucket) => {
              const [tone, label] = ON_FAILURE[bucket.on_failure];
              return (
                <View key={bucket.id} style={styles.bucket}>
                  <Text selectable style={styles.name} variant="mono">
                    {bucket.name}
                  </Text>
                  <Line label="Rate">
                    <Text variant="small">{bucketRate(bucket.limit, bucket.period_seconds)}</Text>
                  </Line>
                  <Line label="Burst">
                    <Text variant="mono">{formatCount(bucket.burst)}</Text>
                  </Line>
                  <Line label="While coss.com can't count">
                    <StatusDot label={label} tone={tone} />
                  </Line>
                </View>
              );
            })}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}

/** One of the dashboard table's columns, as a label and its value. */
function Line(props: { label: string; children: ReactNode }) {
  return (
    <View style={styles.line}>
      <Text muted style={styles.label} variant="small">
        {props.label}
      </Text>
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  bucket: { gap: 6, padding: 16 },
  name: { fontSize: 13, marginBottom: 2 },
  line: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { flex: 1 },
});
