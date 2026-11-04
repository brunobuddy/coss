import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Panel, SpecItem, SpecList } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Code, Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { useHookPortalSettings } from "../../../../../../../../lib/queries-risk-settings";
import { PORTAL_THEME_LABELS } from "../../../../../../../../lib/status-risk-settings";
import { colors, radius } from "../../../../../../../../lib/theme";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/hooks/settings/page.tsx
// and PortalSettingsForm (hooks/hook-actions.tsx). Read-only: the settings are changed on coss.com.
export default function HookPortalSettingsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useHookPortalSettings(params);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const settings = query.data;
  return (
    <Screen onRefresh={() => query.refetch()} title="Portal settings">
      <WebButton path={`${environmentPath(params)}/hooks/settings`} />
      <PageIntro
        description="How the portal looks for your applications' users, and which of your sites may embed it."
        title="Portal settings"
      />
      <Panel
        description={
          <>
            Your backend creates a portal session for an application (
            <Code>coss.hooks.portal.createSession</Code>) and opens or embeds its URL. The portal is
            served from its own domain and never sees your API key.
          </>
        }
        title="Portal"
      >
        <SpecList>
          <SpecItem label="Sites allowed to embed the portal" stacked>
            {settings.allowed_origins.length === 0 ? (
              <Text muted variant="small">
                Without any, the portal only opens as its own page.
              </Text>
            ) : (
              <View style={styles.origins}>
                {settings.allowed_origins.map((origin) => (
                  <Text key={origin} selectable variant="mono">
                    {origin}
                  </Text>
                ))}
              </View>
            )}
          </SpecItem>
          <SpecItem label="Display name">{settings.display_name ?? "—"}</SpecItem>
          <SpecItem label="Accent color">
            {settings.accent_color ? (
              <View style={styles.color}>
                <View style={[styles.swatch, { backgroundColor: settings.accent_color }]} />
                <Text selectable variant="mono">
                  {settings.accent_color}
                </Text>
              </View>
            ) : (
              "—"
            )}
          </SpecItem>
          <SpecItem label="Theme">{PORTAL_THEME_LABELS[settings.theme]}</SpecItem>
        </SpecList>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  origins: { gap: 4 },
  color: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: radius.sm - 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
