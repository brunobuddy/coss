import { useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Icon } from "../../../../../../../components/icon";
import { ModeBadge } from "../../../../../../../components/mode-badge";
import { Panel, PanelBody, Ruled } from "../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../components/screen";
import { Text } from "../../../../../../../components/text";
import { WebButton } from "../../../../../../../components/web-button";
import { formatDateTime } from "../../../../../../../lib/format";
import { useContentStorage } from "../../../../../../../lib/queries-templates";
import { CONTENT_STORAGE_OPTIONS } from "../../../../../../../lib/status-templates";
import { colors, space } from "../../../../../../../lib/theme";
import { type EnvironmentParams, environmentPath } from "../../../../../../../lib/web";

// Copy from apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/content-storage/page.tsx
// (and its storage-form.tsx), read-only: the chosen option is checked; changing it is on coss.com.
const GOOD_TO_KNOW = [
  "Discarded: the subject, HTML and text bodies, custom headers, template variables and attachment names. Attachment bytes are never kept after sending.",
  "Scheduled emails keep their content until they are sent or canceled; it is needed to send them.",
  "Webhook events and logs of these emails never include the subject, and API request logs keep only the length of each content field.",
  "Click tracking keeps the links it redirects. Turn it off under Tracking if your links carry personal data.",
  "Switching back to storing content doesn't restore discarded emails.",
];

export default function ContentStorageScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useContentStorage(params);
  if (query.isPending) return <Screen title="Content storage" loading="list" />;
  if (query.isError && !query.data) {
    return <Screen title="Content storage" error={query.error} onRetry={() => query.refetch()} />;
  }
  const settings = query.data;
  return (
    <Screen onRefresh={() => query.refetch()} title="Content storage">
      <WebButton path={`${environmentPath(params)}/content-storage`} />
      <PageIntro
        description="Whether coss.com keeps a copy of the content of this environment's emails once it has sent them. Each email keeps the setting that applied when it was sent."
        meta={<ModeBadge params={params} />}
        title="Content storage"
      />
      <Panel
        description={
          settings.updated_at
            ? `Last changed ${formatDateTime(settings.updated_at)}.`
            : "Not changed: content is stored."
        }
        title="Email content"
      >
        <Ruled>
          {CONTENT_STORAGE_OPTIONS.map((option) => {
            const chosen = option.value === settings.content_storage;
            return (
              <View
                accessibilityState={{ selected: chosen }}
                key={option.value}
                style={styles.option}
              >
                <View style={[styles.radio, chosen && styles.radioChosen]}>
                  {chosen ? (
                    <Icon color="primaryForeground" icon={Check} size={12} strokeWidth={3} />
                  ) : null}
                </View>
                <View style={styles.optionText}>
                  <Text muted={!chosen} variant="label">
                    {option.label}
                  </Text>
                  <Text muted variant="small">
                    {option.description}
                  </Text>
                </View>
              </View>
            );
          })}
        </Ruled>
      </Panel>
      <Panel title="Good to know">
        <PanelBody gap={10}>
          {GOOD_TO_KNOW.map((item) => (
            <View key={item} style={styles.bullet}>
              <Text muted variant="small">
                –
              </Text>
              <Text muted style={styles.bulletText} variant="small">
                {item}
              </Text>
            </View>
          ))}
        </PanelBody>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  optionText: { flex: 1, gap: space.xxs },
  radio: {
    width: 18,
    height: 18,
    marginTop: 1,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  radioChosen: { borderColor: colors.primary, backgroundColor: colors.primary },
  bullet: { flexDirection: "row", gap: space.sm },
  bulletText: { flex: 1 },
});
