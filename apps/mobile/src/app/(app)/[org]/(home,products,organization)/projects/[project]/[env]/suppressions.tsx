import { useLocalSearchParams } from "expo-router";
import { Ban, SearchX } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge } from "../../../../../../../components/badge";
import { ModeBadge } from "../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../components/paged";
import { PageIntro, Screen } from "../../../../../../../components/screen";
import { SearchField } from "../../../../../../../components/search-field";
import { Text } from "../../../../../../../components/text";
import { WebButton } from "../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../lib/format";
import { ApiRequestError, useSuppressions } from "../../../../../../../lib/queries";
import { space } from "../../../../../../../lib/theme";
import { type EnvironmentParams, environmentPath } from "../../../../../../../lib/web";

// apps/web/src/components/email-badges.tsx (SuppressionReasonBadge).
const REASON_VARIANT = {
  bounce: "error",
  complaint: "error",
  manual: "secondary",
  import: "secondary",
  unsubscribe: "warning",
} as const;

export default function SuppressionsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const [address, setAddress] = useState("");
  const query = useSuppressions(params, address);
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  // The API refuses a partial address; the dashboard shows that as an empty search.
  const invalidAddress =
    Boolean(address) &&
    query.error instanceof ApiRequestError &&
    query.error.error.code === "invalid_request";
  return (
    <Screen onRefresh={() => query.refetch()} title="Suppressions">
      <WebButton path={`${environmentPath(params)}/suppressions`} />
      <PageIntro
        description="Emails from this environment skip these addresses. Permanent bounces and complaints are added automatically; entries for a category only apply to emails sent with that category."
        meta={<ModeBadge params={params} />}
        title="Suppressions"
      />
      <SearchField
        keyboardType="email-address"
        onSubmit={setAddress}
        placeholder="Find an address"
        value={address}
      />
      <PagedPanel
        empty={
          invalidAddress
            ? {
                icon: SearchX,
                title: "Enter a valid email address",
                description: "Search for a full email address, like ann@example.com.",
              }
            : address
              ? {
                  icon: SearchX,
                  title: "This address is not suppressed",
                  description: "Emails to this address are sent normally.",
                }
              : {
                  icon: Ban,
                  title: "No suppressed addresses yet",
                  description:
                    "Permanent bounces and complaints land here, along with addresses you add.",
                }
        }
        items={items}
        query={invalidAddress ? { ...query, isError: false } : query}
        render={(entry) => (
          <View key={entry.id} style={styles.row}>
            <View style={styles.text}>
              <Text numberOfLines={1} selectable variant="label">
                {entry.address}
              </Text>
              <View style={styles.badges}>
                {entry.scope === "*" ? (
                  <Badge variant="outline">All emails</Badge>
                ) : (
                  <View style={styles.scope}>
                    <Badge mono variant="secondary">
                      <Text numberOfLines={1} style={styles.scopeText} variant="mono">
                        {entry.scope}
                      </Text>
                    </Badge>
                  </View>
                )}
                <Badge variant={REASON_VARIANT[entry.reason]}>{entry.reason}</Badge>
              </View>
            </View>
            <Text muted variant="mono">
              {formatAgo(entry.created_at)}
            </Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.lg },
  text: { flex: 1, gap: 6 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  scope: { maxWidth: "100%" },
  scopeText: { flexShrink: 1 },
});
