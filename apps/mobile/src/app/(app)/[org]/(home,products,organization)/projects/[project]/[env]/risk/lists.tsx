import { Stack, useLocalSearchParams } from "expo-router";
import { ListChecks } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Tabs } from "../../../../../../../../components/tabs";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../../lib/format";
import { useRiskLists } from "../../../../../../../../lib/queries";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

type ListFilter = "all" | "block" | "allow";

// risk/lists/add-list-entry-dialog.tsx (LISTS).
const LIST_TABS: { value: ListFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "block", label: "Block list" },
  { value: "allow", label: "Allow list" },
];

export default function RiskListsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const [list, setList] = useState<ListFilter>("all");
  const query = useRiskLists(params, list === "all" ? null : list);
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const now = Date.now();
  return (
    <Screen onRefresh={() => query.refetch()} title="Allow & block lists">
      <WebButton path={`${environmentPath(params)}/risk/lists`} />
      <PageIntro
        description="Email addresses, domains, IP ranges, networks, countries and users whose assessments in this environment are always allowed or always blocked."
        meta={<ModeBadge params={params} />}
        title="Allow & block lists"
      />
      <Tabs items={LIST_TABS} onChange={setList} value={list} />
      <PagedPanel
        empty={{
          icon: ListChecks,
          title: "No entries yet",
          description:
            "Entries decide an assessment before its score: allow trusted users, block known abuse.",
        }}
        items={items}
        query={query}
        render={(entry) => (
          <View key={entry.id} style={styles.entry}>
            <View style={styles.head}>
              <StatusDot
                label={entry.list === "block" ? "Block" : "Allow"}
                tone={entry.list === "block" ? "error" : "success"}
              />
              {entry.expires_at && new Date(entry.expires_at).getTime() <= now ? (
                <Badge variant="outline">expired</Badge>
              ) : null}
              <Text muted variant="small">
                {entry.type}
              </Text>
              <Text muted style={styles.when} variant="mono">
                {formatAgo(entry.created_at)}
              </Text>
            </View>
            <Text selectable variant="mono">
              {entry.value}
            </Text>
            {entry.note ? (
              <Text muted variant="small">
                {entry.note}
              </Text>
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  entry: { gap: 4, padding: 16 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  when: { marginLeft: "auto" },
});
