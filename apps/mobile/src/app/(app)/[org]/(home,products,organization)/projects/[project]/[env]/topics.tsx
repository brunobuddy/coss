import { useLocalSearchParams } from "expo-router";
import { Bookmark } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge } from "../../../../../../../components/badge";
import { EmptyState } from "../../../../../../../components/empty";
import { Panel, Ruled } from "../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../components/screen";
import { Text } from "../../../../../../../components/text";
import { WebButton } from "../../../../../../../components/web-button";
import { useTopics } from "../../../../../../../lib/queries-contacts";
import { space } from "../../../../../../../lib/theme";
import { type EnvironmentParams, environmentPath } from "../../../../../../../lib/web";

// Copy from the dashboard's topics/page.tsx.
export default function TopicsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useTopics(params);

  if (query.isPending) return <Screen title="Topics" loading="list" />;
  if (query.isError && !query.data) {
    return <Screen title="Topics" error={query.error} onRetry={() => query.refetch()} />;
  }
  const topics = query.data.data;

  return (
    <>
      <WebButton path={`${environmentPath(params)}/topics`} />
      <Screen onRefresh={() => query.refetch()} title="Topics">
        <PageIntro
          description="What contacts subscribe to. A topic's key is the category of the emails about it; public topics show in the preference center."
          title="Topics"
        />
        <Panel>
          {topics.length === 0 ? (
            <EmptyState
              tone="marketing"
              description="E.g. a newsletter, product updates or event invitations."
              icon={Bookmark}
              title="No topics yet"
            />
          ) : (
            <Ruled>
              {topics.map((topic) => (
                <View key={topic.id} style={styles.row}>
                  <View style={styles.head}>
                    <Text style={styles.name} variant="label">
                      {topic.name}
                    </Text>
                    <Text muted numberOfLines={1} selectable style={styles.key} variant="mono">
                      {topic.key}
                    </Text>
                  </View>
                  {topic.description ? (
                    <Text muted variant="small">
                      {topic.description}
                    </Text>
                  ) : null}
                  <View style={styles.badges}>
                    <Badge variant="secondary">
                      {topic.default_subscription === "opt_in" ? "Opt-in" : "Opt-out"}
                    </Badge>
                    <Badge variant="outline">
                      {topic.visibility === "public" ? "Public" : "Private"}
                    </Badge>
                  </View>
                </View>
              ))}
            </Ruled>
          )}
        </Panel>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, padding: space.lg },
  head: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  name: { flex: 1 },
  key: { flexShrink: 1, maxWidth: "50%" },
  badges: { flexDirection: "row", gap: 6 },
});
