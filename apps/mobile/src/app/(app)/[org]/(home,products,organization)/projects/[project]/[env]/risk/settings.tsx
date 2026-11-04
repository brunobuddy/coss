import { Stack, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { Panel, PanelBody, Ruled } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Code, Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { useRiskSettings } from "../../../../../../../../lib/queries-risk-settings";
import { CAPTCHA_PROVIDER_LABELS } from "../../../../../../../../lib/status-risk-settings";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/risk/settings/page.tsx
// and its settings-form.tsx (legends, labels and field descriptions). Read-only: the settings are
// changed on coss.com, and the captcha secret is never sent to the app.
export default function RiskSettingsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useRiskSettings(params);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const settings = query.data;
  return (
    <Screen onRefresh={() => query.refetch()} title="Risk settings">
      <WebButton path={`${environmentPath(params)}/risk/settings`} />
      <PageIntro
        description="How this environment's assessments decide: score thresholds, captcha verification, and reasons you don't want."
        meta={<ModeBadge params={params} />}
        title="Risk settings"
      />
      <Panel title="Thresholds">
        <Ruled>
          <Setting description="Scores at or above this are review." label="Review at">
            {settings.review_threshold.toFixed(2)}
          </Setting>
          <Setting description="Scores at or above this are block." label="Block at">
            {settings.block_threshold.toFixed(2)}
          </Setting>
        </Ruled>
      </Panel>
      <Panel title="Captcha">
        <Ruled>
          <Setting
            description="Assessments verify their captcha token with it. coss.com sends the provider the token, your secret and the user's IP address."
            label="Provider"
            plain
          >
            {CAPTCHA_PROVIDER_LABELS[settings.captcha?.provider ?? "none"] ?? "Off"}
          </Setting>
          {settings.captcha ? (
            <Setting
              description="Assessments without one get captcha.missing"
              label="Require a token"
              plain
            >
              {settings.captcha.required ? "Yes" : "No"}
            </Setting>
          ) : null}
        </Ruled>
      </Panel>
      <Panel
        description={
          <>
            Assessments with content fire <Code>{"content.<category>"}</Code> when its score reaches
            the threshold. Leave a category empty and it never fires; rules can still test its
            score.
          </>
        }
        title="Content thresholds"
      >
        <Ruled>
          {settings.content_thresholds.map(({ category, threshold }) => (
            <Setting
              key={category}
              label={category.charAt(0).toUpperCase() + category.slice(1)}
              muted={threshold === null}
            >
              {threshold === null ? "Off" : threshold.toFixed(2)}
            </Setting>
          ))}
        </Ruled>
      </Panel>
      <Panel
        // The form's "Checked reasons…": the app lists only the ones turned off.
        description="These reasons never fire and don't count in the score. Rules still see the facts behind them."
        title="Disabled reasons"
      >
        {settings.disabled_reasons.length === 0 ? (
          <PanelBody>
            <Text muted variant="small">
              None
            </Text>
          </PanelBody>
        ) : (
          <Ruled>
            {settings.disabled_reasons.map((reason) => (
              <View key={reason.code} style={styles.reason}>
                <Text selectable variant="mono">
                  {reason.code}
                </Text>
                <Text muted variant="small">
                  {reason.description}
                </Text>
              </View>
            ))}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}

/** A field of the dashboard's form, read-only: its label and description, its value on the right. */
function Setting(props: {
  label: string;
  description?: string;
  /** A label rather than a measured value (not mono). */
  plain?: boolean;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.setting}>
      <View style={styles.text}>
        <Text variant="label">{props.label}</Text>
        {props.description ? (
          <Text muted variant="small">
            {props.description}
          </Text>
        ) : null}
      </View>
      <Text muted={props.muted} variant={props.plain ? "small" : "mono"}>
        {props.children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  setting: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text: { flex: 1, gap: 2 },
  reason: { gap: 2, paddingHorizontal: 16, paddingVertical: 12 },
});
