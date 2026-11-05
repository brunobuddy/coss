import { getMarketingSettingsRow } from "@coss/email";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { marketingPage } from "@/lib/marketing";
import { MarketingSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Marketing settings" };

export default async function MarketingSettingsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/settings">) {
  const { env, target, context } = await marketingPage(await params);
  const settings = await getMarketingSettingsRow(env);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="What this environment's marketing email says about its sender."
        title="Marketing settings"
      />
      <Panel>
        <PanelBody>
          <MarketingSettingsForm
            {...target}
            canEdit={context.can({ contact: ["update"] })}
            confirmationFrom={settings?.confirmationFrom ?? null}
            confirmationHtml={settings?.confirmationHtml ?? null}
            confirmationSubject={settings?.confirmationSubject ?? null}
            confirmedRedirectUrl={settings?.confirmedRedirectUrl ?? null}
            displayName={settings?.displayName ?? null}
            doubleOptInDefault={settings?.doubleOptInDefault ?? false}
            mailingAddress={settings?.mailingAddress ?? null}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
