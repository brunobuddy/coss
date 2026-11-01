import { listRiskListEntries } from "@coss/risk";
import { ListRiskListEntriesQuery } from "@coss/risk/schemas";
import { getEnvironment } from "@coss/tenancy";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { ListChecksIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { AddRiskListEntryDialog } from "./add-list-entry-dialog";
import { RemoveRiskListEntryButton } from "./remove-list-entry-button";

export const metadata: Metadata = { title: "Allow & block lists" };

const PAGE_SIZE = 50;

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export default async function RiskListsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/risk/lists">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const search = await searchParams;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ riskList: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;

  const after = single(search.after);
  const query = ListRiskListEntriesQuery.safeParse({ after, limit: PAGE_SIZE });
  const page = query.success
    ? await listRiskListEntries(
        { organizationId: organization.id, environmentId: environment.id },
        query.data,
      )
    : null;

  const listPath = `/${organization.slug}/${project.slug}/${environment.slug}/risk/lists`;
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
  };
  const canDelete = can({ riskList: ["delete"] });
  const now = new Date();
  const last = page?.data.at(-1);
  const nextPage = page?.has_more && last ? `${listPath}?after=${last.id}` : null;

  const create = can({ riskList: ["create"] }) ? <AddRiskListEntryDialog {...target} /> : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={create}
        description="Email addresses, domains, IP ranges, networks, countries and users whose assessments in this environment are always allowed or always blocked."
        meta={<ModeBadge mode={environment.mode} />}
        title="Allow & block lists"
      />

      <Panel
        footer={
          after || nextPage ? (
            <CursorPager
              newestHref={after ? listPath : undefined}
              olderHref={nextPage ?? undefined}
            />
          ) : null
        }
      >
        {!page || page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={after ? undefined : create}
              compact
              description={
                after
                  ? "You've reached the end of the list."
                  : "Entries decide an assessment before its score: allow trusted users, block known abuse."
              }
              icon={ListChecksIcon}
              title={after ? "No more entries" : "No entries yet"}
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>List</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Added</TableHead>
                {canDelete ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <StatusDot tone={entry.list === "block" ? "error" : "success"}>
                        <span className="capitalize">{entry.list}</span>
                      </StatusDot>
                      {entry.expires_at && new Date(entry.expires_at) <= now ? (
                        <Badge variant="outline">expired</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{entry.type}</TableCell>
                  <TableCell className="max-w-80 truncate font-medium font-mono text-[0.8125rem]">
                    {entry.value}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {entry.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </TableCell>
                  {canDelete ? (
                    <TableCell>
                      <RemoveRiskListEntryButton
                        {...target}
                        entryId={entry.id}
                        list={entry.list}
                        value={entry.value}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
