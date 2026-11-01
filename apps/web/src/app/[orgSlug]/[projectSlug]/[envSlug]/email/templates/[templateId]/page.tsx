import { EmailError, getTemplateDraft, listDomains } from "@coss/email";
import type { TemplateVariable } from "@coss/email/templates";
import { listVerifiedMemberEmails } from "@coss/tenancy";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { ModeBadge } from "@/components/email-badges";
import { PageHeader } from "@/components/page-header";
import { templatePageContext } from "../page-context";
import { TemplateStatus } from "../template-status";
import { TemplateEditor } from "./template-editor";
import { DeleteTemplateButton, TemplateSettingsDialog } from "./template-settings";

export const metadata: Metadata = { title: "Template" };

async function loadDraft(scope: { organizationId: string; environmentId: string }, id: string) {
  try {
    return await getTemplateDraft(scope, id);
  } catch (error) {
    if (error instanceof EmailError && error.code === "not_found") notFound();
    throw error;
  }
}

export default async function TemplatePage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/templates/[templateId]">) {
  const { templateId, ...rest } = await params;
  const { can, environment, envPath, organization, scope, session, target, templatesPath } =
    await templatePageContext(rest);
  const canSend = can({ email: ["send"] });
  const [{ template, draft }, recipients, domains] = await Promise.all([
    loadDraft(scope, templateId),
    canSend ? listVerifiedMemberEmails({ organizationId: organization.id }) : [],
    canSend && environment.mode === "live" ? listDomains({ organizationId: organization.id }) : [],
  ]);
  // A sender the test send can start from: any address in a sandbox, a verified domain's in live.
  const domain = domains.find((candidate) => candidate.status === "verified");
  const from =
    environment.mode === "sandbox"
      ? `${organization.name} <test@example.com>`
      : domain
        ? `${organization.name} <test@${domain.name}>`
        : "";
  const editorTarget = { ...target, templateId: template.id };

  return (
    <div className="flex flex-col gap-6" data-page-width="full">
      <PageHeader
        actions={
          <>
            <Button
              render={<Link href={`${templatesPath}/${template.id}/versions`} />}
              size="sm"
              variant="outline"
            >
              Versions
            </Button>
            {can({ emailTemplate: ["update"] }) ? (
              <TemplateSettingsDialog target={editorTarget} template={template} />
            ) : null}
            {can({ emailTemplate: ["delete"] }) ? (
              <DeleteTemplateButton name={template.name} target={editorTarget} />
            ) : null}
          </>
        }
        description={template.description ?? undefined}
        meta={
          <>
            <ModeBadge mode={environment.mode} />
            <TemplateStatus
              hasUnpublishedChanges={template.hasUnpublishedChanges}
              publishedVersion={template.publishedVersion}
            />
            {template.alias ? (
              <Badge className="font-mono" variant="secondary">
                {template.alias}
              </Badge>
            ) : null}
            <code className="font-mono text-xs">{template.id}</code>
            <CopyButton label="Copy ID" value={template.id} />
          </>
        }
        title={template.name}
      />
      <TemplateEditor
        canPublish={can({ emailTemplate: ["publish"] })}
        canSend={canSend}
        canUpdate={can({ emailTemplate: ["update"] })}
        draft={{
          revision: draft.revision,
          defaultLocale: draft.defaultLocale,
          variables: draft.variables as TemplateVariable[],
          sampleVariables: draft.sampleVariables,
          contents: draft.contents.map((content) => ({
            locale: content.locale,
            subject: content.subject,
            html: content.html,
            text: content.text,
          })),
        }}
        emailsPath={`${envPath}/email/messages`}
        target={editorTarget}
        testSend={{
          recipients,
          currentUserEmail: session.user.email,
          from,
          sandbox: environment.mode === "sandbox",
        }}
      />
    </div>
  );
}
