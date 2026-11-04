import type { ApiKey } from "@coss/companion";
import { Stack, useLocalSearchParams } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge } from "../../../../../../../components/badge";
import { EmptyState } from "../../../../../../../components/empty";
import { Icon } from "../../../../../../../components/icon";
import { ModeBadge } from "../../../../../../../components/mode-badge";
import { Panel, PanelBody, Ruled } from "../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../components/screen";
import { Text } from "../../../../../../../components/text";
import { WebButton } from "../../../../../../../components/web-button";
import { formatAgo, formatDate } from "../../../../../../../lib/format";
import { useApiKeys, useEnvironment, useMe } from "../../../../../../../lib/queries";
import { type EnvironmentParams, environmentPath } from "../../../../../../../lib/web";

// The dashboard's labels (`API_KEY_PRESET_LABELS` in `@coss/auth/api-key-permissions`).
const ACCESS_LABELS: Record<ApiKey["access"], string> = {
  full: "Full access",
  sending: "Sending access",
  read_only: "Read only",
  custom: "Custom access",
};

/** Who a key belongs to: the organization, or the member it is assigned to (their spend). */
function owner(key: ApiKey, userId: string | undefined): string {
  if (!key.owner) return "Organization";
  return key.owner.id === userId ? "You" : key.owner.name || key.owner.email;
}

export default function ApiKeysScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useApiKeys(params);
  const environment = useEnvironment(params).data;
  const userId = useMe().data?.user.id;
  const live = environment?.environment.mode === "live";
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const where = environment
    ? `${environment.project.name} · ${environment.environment.name}`
    : "this environment";
  return (
    <Screen onRefresh={() => query.refetch()} title="API keys">
      <WebButton path={`${environmentPath(params)}/api-keys`} />
      <PageIntro
        description={`Keys authenticate requests to the API and SDK, and are the password for SMTP. They start with ${query.data.prefix} and only work in ${where}. Create and revoke keys on coss.com.`}
        meta={<ModeBadge params={params} />}
        title="API keys"
      />
      {/* apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/api-keys/personal-keys-switch.tsx */}
      <Panel>
        <PanelBody gap={4}>
          <View style={styles.setting}>
            <Text style={styles.fill} variant="label">
              Personal keys for members
            </Text>
            <Badge variant="outline">{query.data.personal_keys ? "On" : "Off"}</Badge>
          </View>
          <Text muted variant="small">
            Members can create their own keys here, which can do everything a key can in this
            environment.{" "}
            {live
              ? "What they send counts as their spend, within their budget."
              : "Sandbox usage is never billed."}{" "}
            Turning this off keeps existing keys working.
          </Text>
        </PanelBody>
      </Panel>
      <Panel>
        {query.data.data.length === 0 ? (
          <EmptyState
            description="Create a key, then send with it from your server as COSS_API_KEY."
            icon={KeyRound}
            title="No API keys yet"
          />
        ) : (
          <Ruled>
            {query.data.data.map((key) => (
              <View key={key.id} style={styles.row}>
                <Icon color="mutedForeground" icon={KeyRound} size={18} />
                <View style={styles.text}>
                  <View style={styles.name}>
                    <Text numberOfLines={1} style={styles.shrink} variant="label">
                      {key.name ?? "Untitled"}
                    </Text>
                    {key.paused ? <Badge variant="error">Paused</Badge> : null}
                  </View>
                  <Text muted variant="mono">
                    {key.start ? `${key.start}…` : "—"}
                  </Text>
                  <View style={styles.name}>
                    <Text muted style={styles.shrink} variant="small">
                      {owner(key, userId)}
                      {key.owner ? " · personal key" : ""}
                    </Text>
                    {key.owner && key.owner.role === null ? (
                      // Keys of former members stop working; they are revoked when the member leaves.
                      <Badge variant="warning">Left</Badge>
                    ) : null}
                  </View>
                  <Text muted variant="small">
                    {ACCESS_LABELS[key.access]}
                    {key.access === "full" ? "" : ` · ${key.permissions.join(", ")}`}
                  </Text>
                  <Text muted variant="small">
                    Created {formatDate(key.created_at)} · last used{" "}
                    {key.last_used_at ? formatAgo(key.last_used_at) : "never"}
                  </Text>
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
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 },
  text: { flex: 1, gap: 2 },
  name: { flexDirection: "row", alignItems: "center", gap: 8 },
  shrink: { flexShrink: 1 },
  setting: { flexDirection: "row", alignItems: "center", gap: 12 },
  fill: { flex: 1 },
});
