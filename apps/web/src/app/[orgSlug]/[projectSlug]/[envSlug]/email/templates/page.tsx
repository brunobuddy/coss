import { pageEmailTemplates } from "@coss/email";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { LayoutTemplateIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime, formatRelative } from "@/lib/format";
import { CreateTemplateDialog } from "./create-template-dialog";
import { templatePageContext } from "./page-context";
import { TemplateStatus } from "./template-status";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/templates">) {
  const { can, environment, scope, target, templatesPath } = await templatePageContext(
    await params,
  );
  const { after } = await searchParams;
  const cursor = typeof after === "string" ? after : undefined;
  const page = await pageEmailTemplates(scope, { limit: 50, after: cursor });
  const last = page.templates.at(-1);
  const create = can({ emailTemplate: ["create"] }) ? <CreateTemplateDialog {...target} /> : null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={create}
        description="Subjects and bodies with typed variables, in every language you send. Edit a draft, publish it, then send it by id or alias."
        meta={<ModeBadge mode={environment.mode} />}
        title="Templates"
      />

      <Panel
        footer={
          page.templates.length > 0 || cursor ? (
            <CursorPager
              newestHref={cursor ? templatesPath : undefined}
              olderHref={
                page.hasMore && last
                  ? `${templatesPath}?${new URLSearchParams({ after: last.id })}`
                  : undefined
              }
              summary={`${page.templates.length} ${page.templates.length === 1 ? "template" : "templates"}${cursor ? " (older)" : ""}`}
            />
          ) : null
        }
      >
        {page.templates.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={create}
              compact
              description="Keep your emails' copy out of your code: send `template_id` and `variables` instead of `subject` and `html`."
              icon={LayoutTemplateIcon}
              title="No templates yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Alias</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <Link
                      className="font-medium underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${templatesPath}/${template.id}`}
                    >
                      {template.name}
                    </Link>
                    <div className="font-mono text-muted-foreground text-xs">{template.id}</div>
                  </TableCell>
                  <TableCell>
                    {template.alias ? (
                      <Badge className="font-mono" variant="secondary">
                        {template.alias}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <TemplateStatus
                      hasUnpublishedChanges={template.hasUnpublishedChanges}
                      publishedVersion={template.publishedVersion}
                    />
                  </TableCell>
                  <TableCell
                    className="text-right font-mono text-muted-foreground text-xs"
                    title={formatDateTime(template.updatedAt)}
                  >
                    {formatRelative(template.updatedAt, now)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
