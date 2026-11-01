import { listOrganizationsForAdmin } from "@coss/tenancy/admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { BuildingIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ADMIN_PAGE_SIZE,
  ListFilters,
  listHref,
  Pager,
  pageParam,
  stringParam,
} from "@/components/admin/list-controls";
import { OrganizationStatusBadge } from "@/components/admin/status-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { requirePlatformAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Organizations · Admin" };

const STATUSES = [
  { value: "all", label: "All" },
  { value: "suspended", label: "Account suspended" },
];

export default async function AdminOrganizationsPage({
  searchParams,
}: PageProps<"/admin/organizations">) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const query = stringParam(params.q);
  const status = stringParam(params.status) === "suspended" ? "suspended" : "all";
  const page = pageParam(params.page);
  const { organizations, total } = await listOrganizationsForAdmin({
    search: query,
    suspendedOnly: status === "suspended",
    limit: ADMIN_PAGE_SIZE,
    offset: (page - 1) * ADMIN_PAGE_SIZE,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader description="Every organization on the platform." title="Organizations" />
      <ListFilters
        path="/admin/organizations"
        placeholder="Search by name, slug or organization id"
        query={query}
        status={status}
        statuses={STATUSES}
      />
      <Panel
        footer={
          <Pager
            hrefFor={(target) =>
              listHref("/admin/organizations", {
                q: query,
                status: status === "all" ? undefined : status,
                page: target,
              })
            }
            page={page}
            shown={organizations.length}
            total={total}
          />
        }
      >
        {organizations.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="No organization matches these filters."
              icon={BuildingIcon}
              title="No organizations found"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((organization) => (
                <TableRow key={organization.id}>
                  <TableCell className="font-medium">
                    <Link
                      className="hover:underline"
                      href={`/admin/organizations/${organization.id}`}
                    >
                      {organization.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {organization.slug}
                  </TableCell>
                  <TableCell className="tabular-nums">{organization.memberCount}</TableCell>
                  <TableCell>
                    <OrganizationStatusBadge
                      deleting={organization.deleting}
                      suspended={organization.suspendedAt !== null}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(organization.createdAt)}
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
