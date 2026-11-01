import { getRiskSettings } from "@coss/risk";
import { DISABLEABLE_REASON_CODES, REASONS } from "@coss/risk/schemas";
import { getEnvironment } from "@coss/tenancy";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { requireOrgMember } from "@/lib/session";
import { RiskSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Risk settings" };

export default async function RiskSettingsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/risk/settings">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ risk: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const settings = await getRiskSettings({
    organizationId: organization.id,
    environmentId: environment.id,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="How this environment's assessments decide: score thresholds, captcha verification, and reasons you don't want."
        meta={<ModeBadge mode={environment.mode} />}
        title="Risk settings"
      />
      <Panel>
        <PanelBody>
          <RiskSettingsForm
            canUpdate={can({ risk: ["update"] })}
            envSlug={environment.slug}
            orgSlug={organization.slug}
            projectSlug={project.slug}
            reasons={DISABLEABLE_REASON_CODES.map((code) => ({
              code,
              description: REASONS[code].description,
            }))}
            settings={settings}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
