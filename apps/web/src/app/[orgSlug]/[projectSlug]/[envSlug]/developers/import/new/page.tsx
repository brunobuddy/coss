import { getEnvironment } from "@coss/tenancy";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { requireOrgMember } from "@/lib/session";
import { ConnectForm } from "./connect-form";

export const metadata: Metadata = { title: "New import" };

export default async function NewImportPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/developers/import/new">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ environment: ["update"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description={`coss.com reads your account with the key and shows what it found; nothing is imported into ${environment.name} until you choose. Domains are added to the organization.`}
        meta={<ModeBadge mode={environment.mode} />}
        title="Import from another provider"
      />
      <Panel title="Connect">
        <PanelBody>
          <ConnectForm
            envSlug={environment.slug}
            orgSlug={organization.slug}
            projectSlug={project.slug}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
