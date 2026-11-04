import { Stack, useLocalSearchParams } from "expo-router";
import { Tag } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge } from "../../../../../../../components/badge";
import { EmptyState } from "../../../../../../../components/empty";
import { ModeBadge } from "../../../../../../../components/mode-badge";
import { Panel, Ruled, SpecItem, SpecList } from "../../../../../../../components/panel";
import { ErrorState, Loading, PageIntro, Screen } from "../../../../../../../components/screen";
import { Code, Text } from "../../../../../../../components/text";
import { WebButton } from "../../../../../../../components/web-button";
import { formatDateTime } from "../../../../../../../lib/format";
import { useTracking } from "../../../../../../../lib/queries";
import { type EnvironmentParams, environmentPath } from "../../../../../../../lib/web";

// apps/web/src/components/email-badges.tsx (TrackingBadge).
function TrackingBadge(props: { on: boolean }) {
  return props.on ? <Badge variant="success">On</Badge> : <Badge variant="outline">Off</Badge>;
}

export default function TrackingScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useTracking(params);
  if (query.isPending) return <Loading />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const settings = query.data;
  return (
    <Screen onRefresh={() => query.refetch()} title="Open & click tracking">
      <Stack.Screen
        options={{ headerRight: () => <WebButton path={`${environmentPath(params)}/tracking`} /> }}
      />
      <PageIntro
        description={
          <>
            coss.com can add an invisible image to HTML emails to record opens, send links through a
            redirect to record clicks, and add one-click unsubscribe headers, which Gmail, Yahoo and
            Outlook require from bulk senders. Each email's settings are fixed when it is sent: its
            own <Code>tracking</Code> option wins, then the rule for its category, then this
            environment's default.
          </>
        }
        meta={<ModeBadge params={params} />}
        title="Open & click tracking"
      />
      <Panel
        description={`Applies to emails without a category rule. ${
          settings.default
            ? `Last changed ${formatDateTime(settings.default.updated_at)}.`
            : "Not set: tracking and one-click unsubscribe are off."
        }`}
        title="Environment default"
      >
        <SpecList>
          <SpecItem label="Opens">
            <TrackingBadge on={settings.default?.opens ?? false} />
          </SpecItem>
          <SpecItem label="Clicks">
            <TrackingBadge on={settings.default?.clicks ?? false} />
          </SpecItem>
          <SpecItem label="Unsubscribe">
            <TrackingBadge on={settings.default?.unsubscribe ?? false} />
          </SpecItem>
        </SpecList>
      </Panel>
      <Panel
        description={
          <>
            Override the default for emails sent with a <Code>category</Code>, e.g. track{" "}
            <Code>marketing</Code> and let its recipients unsubscribe, but never{" "}
            <Code>password-reset</Code>.
          </>
        }
        title="Category rules"
      >
        {settings.categories.length === 0 ? (
          <EmptyState
            description="Every category follows the environment default."
            icon={Tag}
            title="No category rules"
          />
        ) : (
          <Ruled>
            {settings.categories.map((rule) => (
              <View key={rule.category} style={styles.rule}>
                <View style={styles.ruleHead}>
                  <Text numberOfLines={1} style={styles.category} variant="label">
                    {rule.category}
                  </Text>
                  <Text muted variant="mono">
                    {formatDateTime(rule.updated_at)}
                  </Text>
                </View>
                <View style={styles.badges}>
                  <Badge variant={rule.opens ? "success" : "outline"}>Opens</Badge>
                  <Badge variant={rule.clicks ? "success" : "outline"}>Clicks</Badge>
                  <Badge variant={rule.unsubscribe ? "success" : "outline"}>Unsubscribe</Badge>
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
  rule: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  ruleHead: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  category: { flex: 1 },
  badges: { flexDirection: "row", gap: 6 },
});
