import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { useLocalSearchParams } from "expo-router";
import { MessageSquareReply } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge } from "../../../../../../../../components/badge";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../../lib/format";
import { useEnvironment, useReceivedSms } from "../../../../../../../../lib/queries";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// The dashboard's sms/received/page.tsx: no detail page, so each row shows the whole text.
export default function ReceivedSmsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useReceivedSms(params);
  const mode = useEnvironment(params).data?.environment.mode;
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Screen onRefresh={() => query.refetch()} title="Received SMS">
      <WebButton path={`${environmentPath(params)}/sms/received`} />
      <PageIntro
        description={`Replies and other messages to your organization's numbers whose replies come to this environment (set on each number). STOP and START are applied to every live environment's suppression list whatever the number's setting. Received SMS are kept for ${formatRetentionDays(RETENTION_DAYS.receivedSms)}.`}
        meta={<ModeBadge params={params} />}
        title="Received SMS"
      />
      <PagedPanel
        empty={{
          icon: MessageSquareReply,
          title: "Nothing received yet",
          description:
            mode === "sandbox"
              ? "Send to the simulator's reply number, +15005550008, to get a simulated reply here."
              : "Replies to your numbers land here once a number sends its replies to this environment.",
        }}
        items={items}
        query={query}
        render={(message) => (
          <View key={message.id} style={styles.row}>
            <View style={styles.head}>
              <Text numberOfLines={1} selectable style={styles.from} variant="mono">
                {message.from}
              </Text>
              <Text muted variant="mono">
                {formatAgo(message.created_at)}
              </Text>
            </View>
            <View style={styles.head}>
              <Text muted numberOfLines={1} style={styles.from} variant="mono">
                {`to ${message.to}`}
              </Text>
              {message.keyword ? <Badge variant="secondary">{message.keyword}</Badge> : null}
            </View>
            <Text selectable variant="small">
              {message.body}
            </Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  from: { flexShrink: 1 },
});
