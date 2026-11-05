import { pageSubaccounts, searchSubaccounts } from "@coss/email";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { SearchXIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SearchForm } from "@/components/search-form";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime, formatRelative } from "@/lib/format";
import { REPUTATION_TONE, STATUS_TONE, subaccountPageContext } from "./page-context";
import { CreateSubaccountDialog } from "./subaccount-actions";

export const metadata: Metadata = { title: "Sub-accounts" };

export default async function SubaccountsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/subaccounts">) {
  const { can, environment, subaccountsPath, organization, target } = await subaccountPageContext(
    await params,
  );
  const { q, after } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const cursor = typeof after === "string" ? after : undefined;
  const base = { organizationId: organization.id, environmentId: environment.id };
  const page = query
    ? { subaccounts: await searchSubaccounts({ ...base, query }), hasMore: false }
    : await pageSubaccounts({ ...base, after: cursor });
  const last = page.subaccounts.at(-1);
  const createDialog = can({ subaccount: ["create"] }) ? (
    <CreateSubaccountDialog {...target} />
  ) : null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={createDialog}
        description="Your users, each with their own domains, suppressions, quotas and reputation: one user's bounces or complaints pause only them."
        meta={<ModeBadge mode={environment.mode} />}
        title="Sub-accounts"
      />

      <div className="flex justify-end">
        <SearchForm action={subaccountsPath} placeholder="Find by uid, name or id" query={query} />
      </div>

      <Panel
        footer={
          !query && (page.subaccounts.length > 0 || cursor) ? (
            <CursorPager
              newestHref={cursor ? subaccountsPath : undefined}
              olderHref={
                page.hasMore && last
                  ? `${subaccountsPath}?${new URLSearchParams({ after: last.id })}`
                  : undefined
              }
              summary={`${page.subaccounts.length} ${page.subaccounts.length === 1 ? "sub-account" : "sub-accounts"}${cursor ? " (older)" : ""}`}
            />
          ) : null
        }
        title="Sub-accounts"
      >
        {page.subaccounts.length === 0 ? (
          <PanelBody flush>
            {query ? (
              <EmptyState
                action={
                  <Button render={<Link href={subaccountsPath} />} size="sm" variant="outline">
                    Clear search
                  </Button>
                }
                compact
                description="No sub-account matches."
                icon={SearchXIcon}
                title="Nothing found"
              />
            ) : (
              <EmptyState
                action={createDialog}
                compact
                description="Create one per user of your platform who sends email, through the API or here."
                icon={UsersIcon}
                title="No sub-accounts yet"
              />
            )}
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Sub-account</TableHead>
                <TableHead>UID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reputation</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.subaccounts.map((row) => {
                const [statusTone, statusLabel] = STATUS_TONE[row.status];
                const [reputationTone, reputationLabel] = REPUTATION_TONE[row.reputationStatus];
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        className="font-medium underline-offset-4 before:absolute before:inset-0 hover:underline"
                        href={`${subaccountsPath}/${row.id}`}
                      >
                        {row.name}
                      </Link>
                      <div className="font-mono text-muted-foreground text-xs">{row.id}</div>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {row.uid ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusDot tone={statusTone}>{statusLabel}</StatusDot>
                    </TableCell>
                    <TableCell>
                      <StatusDot tone={reputationTone}>{reputationLabel}</StatusDot>
                    </TableCell>
                    <TableCell
                      className="text-right font-mono text-muted-foreground text-xs"
                      title={formatDateTime(row.createdAt)}
                    >
                      {formatRelative(row.createdAt, now)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
