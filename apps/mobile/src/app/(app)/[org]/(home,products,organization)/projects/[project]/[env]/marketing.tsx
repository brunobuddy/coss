import { Stack, useLocalSearchParams } from "expo-router";
import { CodeBlock } from "../../../../../../../components/code-block";
import { Panel, SpecItem, SpecList } from "../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../components/screen";
import { WebButton } from "../../../../../../../components/web-button";
import { useMarketingSettings } from "../../../../../../../lib/queries-broadcasts";
import { type EnvironmentParams, environmentPath } from "../../../../../../../lib/web";

// The dashboard's marketing/page.tsx and its settings-form.tsx (labels and help copied from
// there), read-only: the settings are changed on coss.com.
export default function MarketingSettingsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useMarketingSettings(params);
  const header = <WebButton path={`${environmentPath(params)}/marketing`} />;

  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { settings } = query.data;

  return (
    <>
      {header}
      <Screen onRefresh={() => query.refetch()} title="Marketing settings">
        <PageIntro
          description="What this environment's marketing email says about its sender."
          title="Marketing settings"
        />
        <Panel footer="Every marketing email carries the postal address in its footer (the CAN-SPAM Act requires a valid physical address). Marketing email can't be sent without one.">
          <SpecList>
            <SpecItem label="Sender name">{settings.display_name ?? "—"}</SpecItem>
            <SpecItem label="Postal address" stacked>
              {settings.mailing_address ?? "—"}
            </SpecItem>
          </SpecList>
        </Panel>
        <Panel
          footer="Contacts you add or import in the dashboard are added as you set them: you vouch for their consent."
          title="Double opt-in"
        >
          <SpecList>
            <SpecItem
              label="Ask contacts added through the API to confirm by email (unless the request says otherwise)"
              stacked
            >
              {settings.double_opt_in_default ? "On" : "Off"}
            </SpecItem>
            <SpecItem label="Confirmation sender" mono>
              {settings.confirmation_from ?? "—"}
            </SpecItem>
            <SpecItem label="Confirmation subject" stacked>
              {settings.confirmation_subject ?? "—"}
            </SpecItem>
            <SpecItem label="Confirmation HTML" stacked>
              {settings.confirmation_html === null ? (
                "coss.com's default email"
              ) : (
                <CodeBlock>{settings.confirmation_html}</CodeBlock>
              )}
            </SpecItem>
            <SpecItem label="After confirming, go to" stacked>
              {settings.confirmed_redirect_url ?? "A coss.com page"}
            </SpecItem>
          </SpecList>
        </Panel>
      </Screen>
    </>
  );
}
