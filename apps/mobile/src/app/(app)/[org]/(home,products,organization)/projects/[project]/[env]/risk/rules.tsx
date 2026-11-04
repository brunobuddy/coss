import { useLocalSearchParams } from "expo-router";
import { ListFilter } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import { EmptyState } from "../../../../../../../../components/empty";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { Panel, Ruled } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { useRiskRules } from "../../../../../../../../lib/queries";
import { DECISION_TONE } from "../../../../../../../../lib/status";
import { space } from "../../../../../../../../lib/theme";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

export default function RiskRulesScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useRiskRules(params);
  if (query.isPending) return <Screen title="Rules" loading="list" />;
  if (query.isError && !query.data) {
    return <Screen title="Rules" error={query.error} onRetry={() => query.refetch()} />;
  }
  return (
    <Screen onRefresh={() => query.refetch()} title="Rules">
      <WebButton path={`${environmentPath(params)}/risk/rules`} />
      <PageIntro
        description="Checked after the allow and block lists, in position order: the first enabled rule whose conditions match an event decides it."
        meta={<ModeBadge params={params} />}
        title="Rules"
      />
      <Panel>
        {query.data.data.length === 0 ? (
          <EmptyState
            tone="risk"
            description="Without rules, decisions come from the lists and the score."
            icon={ListFilter}
            title="No rules yet"
          />
        ) : (
          <Ruled>
            {query.data.data.map((rule) => (
              <View key={rule.id} style={[styles.rule, !rule.enabled && styles.off]}>
                <Text muted style={styles.position} variant="mono">
                  {rule.position}
                </Text>
                <View style={styles.body}>
                  <View style={styles.head}>
                    <Text style={styles.name} variant="label">
                      {rule.name}
                    </Text>
                    <Badge variant={DECISION_TONE[rule.action] ?? "secondary"}>{rule.action}</Badge>
                  </View>
                  <Text variant="small">{rule.when}</Text>
                  <View style={styles.head}>
                    <Text muted variant="mono">
                      {rule.events.length > 0 ? rule.events.join(", ") : "every event"}
                    </Text>
                    {rule.enabled ? null : <StatusDot label="Disabled" tone="neutral" />}
                  </View>
                </View>
              </View>
            ))}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rule: { flexDirection: "row", gap: space.md, padding: space.lg },
  off: { opacity: 0.7 },
  position: { width: 16, paddingTop: 3 },
  body: { flex: 1, gap: space.xs },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { flex: 1 },
});
