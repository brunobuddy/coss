import { useLocalSearchParams } from "expo-router";
import { History, Lock } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge } from "../../../../../components/badge";
import { EmptyState } from "../../../../../components/empty";
import { PagedPanel } from "../../../../../components/paged";
import { Panel } from "../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../components/screen";
import { Text } from "../../../../../components/text";
import { WebButton } from "../../../../../components/web-button";
import { formatAgo } from "../../../../../lib/format";
import { useAudit } from "../../../../../lib/queries";

export default function AuditScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const query = useAudit(org);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const allowed = query.data.pages[0]?.plan_allows ?? true;
  const events = query.data.pages.flatMap((page) => page.data);
  const path = `/${org}/settings/audit`;
  return (
    <Screen onRefresh={() => query.refetch()} title="Audit log">
      {/* Without the plan, coss.com's page is an upgrade prompt: no purchase links here (3.1.1). */}
      {allowed ? <WebButton path={path} /> : null}
      <PageIntro
        description="Who changed what in this organization: members in the dashboard, API keys, and coss.com support. Newest first; entries can't be edited or deleted."
        title="Audit log"
      />
      {allowed ? (
        <PagedPanel
          empty={{
            icon: History,
            title: "Nothing recorded yet",
            description:
              "Changes to API keys, members, domains, webhooks and settings show up here.",
          }}
          items={events}
          query={query}
          render={(event) => (
            <View key={event.id} style={styles.event}>
              <View style={styles.head}>
                <Text style={styles.action} variant="label">
                  {event.action_label}
                </Text>
                <Text muted variant="mono">
                  {formatAgo(event.created_at)}
                </Text>
              </View>
              <View style={styles.meta}>
                {event.actor_type === "system" ? <Badge variant="info">coss.com</Badge> : null}
                <Text muted numberOfLines={1} style={styles.flex} variant="small">
                  {[event.actor_label, event.target_label].filter(Boolean).join(" → ")}
                </Text>
              </View>
              {event.details ? (
                <Text muted numberOfLines={3} variant="mono">
                  {event.details}
                </Text>
              ) : null}
              <Text muted variant="mono">
                {event.environment ?? "Organization"}
                {event.client_ip ? ` · ${event.client_ip}` : ""}
              </Text>
            </View>
          )}
        />
      ) : (
        <Panel>
          <EmptyState
            description="See who changed API keys, members, domains, webhooks and settings, from the dashboard or the API. Changes are already being recorded."
            icon={Lock}
            title="The audit log is part of the Pro plan"
          />
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  event: { gap: 4, padding: 16 },
  head: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  action: { flex: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  flex: { flex: 1 },
});
