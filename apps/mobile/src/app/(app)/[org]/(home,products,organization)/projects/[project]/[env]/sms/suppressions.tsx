import { Stack, useLocalSearchParams } from "expo-router";
import { MessageSquareX } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge } from "../../../../../../../../components/badge";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../../lib/format";
import { useSmsSuppressions } from "../../../../../../../../lib/queries-sms-senders";
import { SMS_SUPPRESSION_REASON } from "../../../../../../../../lib/status-sms-senders";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/sms/suppressions/page.tsx.
// Read-only: numbers are added and removed on coss.com.
export default function SmsSuppressionsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useSmsSuppressions(params);
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Screen onRefresh={() => query.refetch()} title="SMS suppressions">
      <Stack.Screen
        options={{
          headerRight: () => <WebButton path={`${environmentPath(params)}/sms/suppressions`} />,
        }}
      />
      <PageIntro
        description="Messages from this environment skip these numbers. People who reply STOP (in every live environment) and numbers that can't receive SMS are added automatically."
        meta={<ModeBadge params={params} />}
        title="SMS suppressions"
      />
      <PagedPanel
        empty={{
          icon: MessageSquareX,
          title: "No suppressed numbers",
          description: "Opt-outs and invalid numbers land here, along with numbers you add.",
        }}
        items={items}
        query={query}
        render={(entry) => {
          const reason = SMS_SUPPRESSION_REASON[entry.reason];
          return (
            <View key={entry.id} style={styles.row}>
              <View style={styles.text}>
                <Text numberOfLines={1} selectable variant="label">
                  {entry.phone_number}
                </Text>
                <Badge variant={reason.variant}>{reason.label}</Badge>
              </View>
              <Text muted variant="mono">
                {formatAgo(entry.created_at)}
              </Text>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 },
  text: { flex: 1, gap: 6, alignItems: "flex-start" },
});
