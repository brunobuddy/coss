import { listSuppressions } from "@coss/email";
import { ListSuppressionsQuery } from "@coss/email/schemas";
import { RETENTION_DAYS, retentionCutoff } from "@coss/retention";
import { getEnvironment } from "@coss/tenancy";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { BanIcon, DownloadIcon, SearchXIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CursorPager } from "@/components/cursor-pager";
import {
  ModeBadge,
  SuppressionReasonBadge,
  SuppressionScopeBadge,
} from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SearchForm } from "@/components/search-form";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { AddSuppressionDialog } from "./add-suppression-dialog";
import { ImportSuppressionsDialog } from "./import-suppressions-dialog";
import { RemoveSuppressionButton } from "./remove-suppression-button";

export const metadata: Metadata = { title: "Suppressions" };

const PAGE_SIZE = 50;

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export default async function SuppressionsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/suppressions">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const search = await searchParams;
  const { organization, can } = await requireOrgMember(orgSlug);
  const emailsKeptSince = retentionCutoff(RETENTION_DAYS.emails);
  if (!can({ suppression: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;

  const address = single(search.address);
  const after = single(search.after);
  const query = ListSuppressionsQuery.safeParse({ address, after, limit: PAGE_SIZE });
  const page = query.success
    ? await listSuppressions(
        { organizationId: organization.id, environmentId: environment.id },
        query.data,
      )
    : null;

  const base = `/${organization.slug}/${project.slug}/${environment.slug}`;
  const listPath = `${base}/email/suppressions`;
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
  };
  const canCreate = can({ suppression: ["create"] });
  const canDelete = can({ suppression: ["delete"] });
  const last = page?.data.at(-1);
  const nextPage =
    page?.has_more && last
      ? `${listPath}?${new URLSearchParams({ ...(address ? { address } : {}), after: last.id })}`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {/* A plain link: the CSV comes from a route handler, not a page. */}
            <Button render={<a download href={`${listPath}/export`} />} size="sm" variant="outline">
              <DownloadIcon />
              Export CSV
            </Button>
            {canCreate ? <ImportSuppressionsDialog {...target} /> : null}
            {canCreate ? <AddSuppressionDialog {...target} /> : null}
          </>
        }
        description="Emails from this environment skip these addresses. Permanent bounces and complaints are added automatically; entries for a category only apply to emails sent with that category."
        meta={<ModeBadge mode={environment.mode} />}
        title="Suppressions"
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchForm
          action={listPath}
          name="address"
          placeholder="Find an address"
          query={address ?? ""}
          type="email"
        />
        {address ? (
          <Button render={<Link href={listPath} />} variant="ghost">
            Clear
          </Button>
        ) : null}
      </div>

      <Panel
        footer={
          after || nextPage ? (
            <CursorPager
              newestHref={
                after
                  ? address
                    ? `${listPath}?${new URLSearchParams({ address })}`
                    : listPath
                  : undefined
              }
              olderHref={nextPage ?? undefined}
            />
          ) : null
        }
      >
        {!page ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Search for a full email address, like ann@example.com."
              icon={SearchXIcon}
              title="Enter a valid email address"
            />
          </PanelBody>
        ) : page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description={
                address
                  ? "Emails to this address are sent normally."
                  : after
                    ? "You've reached the end of the list."
                    : "Permanent bounces and complaints land here, along with addresses you add."
              }
              icon={address ? SearchXIcon : BanIcon}
              title={
                address
                  ? "This address is not suppressed"
                  : after
                    ? "No more suppressions"
                    : "No suppressed addresses yet"
              }
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Added</TableHead>
                {canDelete ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((suppression) => (
                <TableRow key={suppression.id}>
                  <TableCell className="max-w-80 truncate font-medium">
                    {suppression.address}
                  </TableCell>
                  <TableCell>
                    <SuppressionScopeBadge scope={suppression.scope} />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <SuppressionReasonBadge reason={suppression.reason} />
                      {/* The email is deleted after its retention; the entry outlives it. */}
                      {suppression.email_id &&
                      new Date(suppression.created_at) > emailsKeptSince ? (
                        <Link
                          className="text-muted-foreground text-xs hover:underline"
                          href={`${base}/email/messages/${suppression.email_id}`}
                        >
                          View email
                        </Link>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(suppression.created_at)}
                  </TableCell>
                  {canDelete ? (
                    <TableCell>
                      <RemoveSuppressionButton
                        {...target}
                        address={suppression.address}
                        scope={suppression.scope}
                        suppressionId={suppression.id}
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
