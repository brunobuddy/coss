import { getHookPortalSettings } from "@coss/hooks";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { PortalSettingsForm } from "../hook-actions";
import { hookPageContext } from "../page-context";

export const metadata: Metadata = { title: "Hooks portal settings" };

export default async function HookPortalSettingsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/hooks/settings">) {
  const { can, organization, environment, target } = await hookPageContext(await params);
  if (!can({ hook: ["update"] })) notFound();
  const settings = await getHookPortalSettings({
    organizationId: organization.id,
    environmentId: environment.id,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="How the portal looks for your applications' users, and which of your sites may embed it."
        title="Portal settings"
      />
      <Panel
        description={
          <>
            Your backend creates a portal session for an application (
            <code className="font-mono">coss.hooks.portal.createSession</code>) and opens or embeds
            its URL. The portal is served from its own domain and never sees your API key.
          </>
        }
        title="Portal"
      >
        <PanelBody>
          <PortalSettingsForm
            {...target}
            sandbox={environment.mode === "sandbox"}
            settings={settings}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
