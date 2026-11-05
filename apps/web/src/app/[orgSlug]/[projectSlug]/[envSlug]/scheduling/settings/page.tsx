import { getSettings } from "@coss/scheduling";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { schedulingPageContext } from "../page-context";
import { SettingsForm } from "../scheduling-actions";

export const metadata: Metadata = { title: "Scheduling settings" };

export default async function SchedulingSettingsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/settings">) {
  const { scope, can, target } = await schedulingPageContext(await params);
  const settings = await getSettings(scope);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="How booking emails read, who can embed the hosted pages, and what happens when a calendar fails."
        title="Settings"
      />
      <Panel>
        <PanelBody>
          <SettingsForm {...target} canEdit={can({ scheduling: ["update"] })} settings={settings} />
        </PanelBody>
      </Panel>
    </div>
  );
}
