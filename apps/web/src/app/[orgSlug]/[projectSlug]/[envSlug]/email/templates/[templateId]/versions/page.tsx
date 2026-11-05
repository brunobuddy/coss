import { EmailError, pageTemplateVersions } from "@coss/email";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { HistoryIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CursorPager } from "@/components/cursor-pager";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { templatePageContext } from "../../page-context";

export const metadata: Metadata = { title: "Template versions" };

export default async function TemplateVersionsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/templates/[templateId]/versions">) {
  const { templateId, ...rest } = await params;
  const { scope, templatesPath } = await templatePageContext(rest);
  const { after } = await searchParams;
  const cursor = typeof after === "string" && /^\d+$/.test(after) ? Number(after) : undefined;
  const page = await pageTemplateVersions(scope, templateId, { limit: 20, after: cursor }).catch(
    (error: unknown) => {
      if (error instanceof EmailError && error.code === "not_found") notFound();
      throw error;
    },
  );
  const { template, versions } = page;
  const path = `${templatesPath}/${template.id}/versions`;
  const last = versions.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Every published version, which never changes. Restore one into the draft to publish it again."
        title={`${template.name}: versions`}
      />
      <Panel
        footer={
          versions.length > 0 || cursor ? (
            <CursorPager
              newestHref={cursor ? path : undefined}
              olderHref={
                page.hasMore && last?.version
                  ? `${path}?${new URLSearchParams({ after: String(last.version) })}`
                  : undefined
              }
              summary={`${versions.length} ${versions.length === 1 ? "version" : "versions"}${cursor ? " (older)" : ""}`}
            />
          ) : null
        }
      >
        {versions.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Publish the draft to create version 1."
              icon={HistoryIcon}
              title="Not published yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Locales</TableHead>
                <TableHead>Variables</TableHead>
                <TableHead className="text-right">Published</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell>
                    <Link
                      className="font-medium underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${path}/${version.version}`}
                    >
                      Version {version.version}
                    </Link>{" "}
                    {version.version === template.publishedVersion ? (
                      <Badge variant="success">Current</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {version.contents.map((content) => content.locale).join(", ")}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {version.variables.map((variable) => variable.name).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground text-xs">
                    {formatDateTime(version.publishedAt)}
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
