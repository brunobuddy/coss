import { EmailError, getTemplateVersion } from "@coss/email";
import type { TemplateVariable } from "@coss/email/templates";
import { Badge } from "@coss/ui/components/badge";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";
import { templatePageContext } from "../../../page-context";
import { VersionView } from "./version-view";

export const metadata: Metadata = { title: "Template version" };

export default async function TemplateVersionPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/templates/[templateId]/versions/[version]">) {
  const { templateId, version: versionParam, ...rest } = await params;
  const { can, scope, target } = await templatePageContext(rest);
  if (!/^\d+$/.test(versionParam)) notFound();
  const found = await getTemplateVersion(scope, templateId, Number(versionParam)).catch(
    (error: unknown) => {
      if (error instanceof EmailError && error.code === "not_found") notFound();
      throw error;
    },
  );
  const { template, version } = found;
  if (!version || version.version === null) notFound();

  return (
    <div className="flex flex-col gap-6" data-page-width="full">
      <PageHeader
        meta={
          <>
            {version.version === template.publishedVersion ? (
              <Badge variant="success">Current</Badge>
            ) : null}
            <span>Published {formatDateTime(version.publishedAt)}</span>
          </>
        }
        title={`${template.name}: version ${version.version}`}
      />
      <VersionView
        canRestore={can({ emailTemplate: ["update"] })}
        contents={version.contents.map((content) => ({
          locale: content.locale,
          subject: content.subject,
          html: content.html,
          text: content.text,
        }))}
        defaultLocale={version.defaultLocale}
        sample={version.sampleVariables}
        target={{ ...target, templateId: template.id }}
        variables={version.variables as TemplateVariable[]}
        version={version.version}
      />
    </div>
  );
}
