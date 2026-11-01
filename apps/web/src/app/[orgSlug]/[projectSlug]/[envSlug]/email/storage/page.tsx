import { getStorageSettings } from "@coss/email";
import { getEnvironment } from "@coss/tenancy";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { StorageSettingsForm } from "./storage-form";

export const metadata: Metadata = { title: "Content storage" };

export default async function ContentStoragePage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/storage">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ environment: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;

  const settings = await getStorageSettings({
    organizationId: organization.id,
    environmentId: environment.id,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Whether coss.com keeps a copy of the content of this environment's emails once it has sent them. Each email keeps the setting that applied when it was sent."
        meta={<ModeBadge mode={environment.mode} />}
        title="Content storage"
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Panel
            description={
              settings.updatedAt
                ? `Last changed ${formatDateTime(settings.updatedAt)}.`
                : "Not changed: content is stored."
            }
            title="Email content"
          >
            <PanelBody>
              <StorageSettingsForm
                canEdit={can({ environment: ["update"] })}
                contentStorage={settings.contentStorage}
                envSlug={environment.slug}
                key={settings.updatedAt?.toISOString() ?? "unset"}
                orgSlug={organization.slug}
                projectSlug={project.slug}
              />
            </PanelBody>
          </Panel>
        </div>

        <Panel title="Good to know">
          <PanelBody>
            <ul className="flex flex-col gap-2.5 text-muted-foreground text-sm [&>li]:relative [&>li]:ps-4 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:content-['–']">
              <li>
                Discarded: the subject, HTML and text bodies, custom headers, template variables and
                attachment names. Attachment bytes are never kept after sending.
              </li>
              <li>
                Scheduled emails keep their content until they are sent or canceled; it is needed to
                send them.
              </li>
              <li>
                Webhook events and logs of these emails never include the subject, and API request
                logs keep only the length of each content field.
              </li>
              <li>
                Click tracking keeps the links it redirects. Turn it off under Tracking if your
                links carry personal data.
              </li>
              <li>Switching back to storing content doesn&apos;t restore discarded emails.</li>
            </ul>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
