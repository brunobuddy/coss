import { pageHookApplications, searchHookApplications } from "@coss/hooks";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { SearchXIcon, WebhookIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SearchForm } from "@/components/search-form";
import { formatDateTime, formatRelative } from "@/lib/format";
import { CreateApplicationDialog } from "./hook-actions";
import { hookPageContext } from "./page-context";

export const metadata: Metadata = { title: "Hooks" };

export default async function HooksPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/hooks">) {
  const { can, environment, hooksPath, organization, target } = await hookPageContext(await params);
  const { q, after } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const cursor = typeof after === "string" ? after : undefined;
  const base = { organizationId: organization.id, environmentId: environment.id };
  const page = query
    ? { applications: await searchHookApplications({ ...base, query }), hasMore: false }
    : await pageHookApplications({ ...base, after: cursor });
  const last = page.applications.at(-1);
  const createDialog = can({ hook: ["create"] }) ? <CreateApplicationDialog {...target} /> : null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={createDialog}
        description="Send a message to one of your applications once: coss.com delivers it, signed and retried, to every endpoint its users registered."
        meta={<ModeBadge mode={environment.mode} />}
        title="Hooks"
      />

      <div className="flex justify-end">
        <SearchForm action={hooksPath} placeholder="Find by uid, name or id" query={query} />
      </div>

      <Panel
        footer={
          !query && (page.applications.length > 0 || cursor) ? (
            <CursorPager
              newestHref={cursor ? hooksPath : undefined}
              olderHref={
                page.hasMore && last
                  ? `${hooksPath}?${new URLSearchParams({ after: last.id })}`
                  : undefined
              }
              summary={`${page.applications.length} ${page.applications.length === 1 ? "application" : "applications"}${cursor ? " (older)" : ""}`}
            />
          ) : null
        }
        title="Applications"
      >
        {page.applications.length === 0 ? (
          <PanelBody flush>
            {query ? (
              <EmptyState
                action={
                  <Button render={<Link href={hooksPath} />} size="sm" variant="outline">
                    Clear search
                  </Button>
                }
                compact
                description="No application matches."
                icon={SearchXIcon}
                title="Nothing found"
              />
            ) : (
              <EmptyState
                action={createDialog}
                compact
                description="Create one per customer (or user) who receives your messages, through the API or here."
                icon={WebhookIcon}
                title="No applications yet"
              />
            )}
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Application</TableHead>
                <TableHead>UID</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.applications.map((application) => (
                <TableRow key={application.id}>
                  <TableCell>
                    <Link
                      className="font-medium underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${hooksPath}/${application.id}`}
                    >
                      {application.name}
                    </Link>
                    <div className="font-mono text-muted-foreground text-xs">{application.id}</div>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {application.uid ?? "—"}
                  </TableCell>
                  <TableCell
                    className="text-right font-mono text-muted-foreground text-xs"
                    title={formatDateTime(application.createdAt)}
                  >
                    {formatRelative(application.createdAt, now)}
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
