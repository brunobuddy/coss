import { findSubaccount, listDomains, listEmailsPage } from "@coss/email";
import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { getEnvironment } from "@coss/tenancy";
import { Button } from "@coss/ui/components/button";
import { DownloadIcon, MailIcon, SearchXIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listHref, stringParam } from "@/components/admin/list-controls";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmailFilterBar } from "@/components/email-filters";
import { EmailTable } from "@/components/email-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import {
  emailFilterParams,
  emailFilterQuery,
  hasEmailFilters,
  toEmailListFilters,
} from "@/lib/email-filters";
import { environmentPath } from "@/lib/navigation";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "Emails" };

const PAGE_SIZE = 50;

export default async function EmailsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/messages">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const search = await searchParams;
  const { organization } = await requireOrgMember(orgSlug);
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;

  const filters = emailFilterParams((name) => stringParam(search[name]));
  const before = stringParam(search.before) || undefined;
  const scope = { organizationId: organization.id, environmentId: environment.id };
  const [page, domains, subaccount] = await Promise.all([
    listEmailsPage({ ...scope, limit: PAGE_SIZE, ...toEmailListFilters(filters), before }),
    listDomains({ organizationId: organization.id }),
    filters.subaccount ? findSubaccount({ ...scope, ref: filters.subaccount }) : null,
  ]);

  const base = environmentPath(organization.slug, project.slug, environment.slug);
  const path = `${base}/email/messages`;
  const filtered = hasEmailFilters(filters);
  const hrefWith = (overrides: { before?: string }) =>
    listHref(path, { ...emailFilterQuery(filters), before: overrides.before });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          // A plain link: the CSV comes from a route handler, with the list's filters.
          <Button
            render={<a download href={listHref(`${path}/export`, emailFilterQuery(filters))} />}
            size="sm"
            variant="outline"
          >
            <DownloadIcon />
            Export CSV
          </Button>
        }
        description={`Every email sent with ${project.name} · ${environment.name}'s keys, newest first. Emails are kept for ${formatRetentionDays(RETENTION_DAYS.emails)}.`}
        meta={<ModeBadge mode={environment.mode} />}
        title="Emails"
      />

      <EmailFilterBar
        domains={domains.map((domain) => domain.name)}
        params={filters}
        path={path}
        subaccountLabel={subaccount ? (subaccount.uid ?? subaccount.name) : undefined}
      />

      <Panel
        footer={
          page.items.length > 0 || before ? (
            <CursorPager
              newestHref={before ? hrefWith({}) : undefined}
              olderHref={page.nextCursor ? hrefWith({ before: page.nextCursor }) : undefined}
              summary={`${page.items.length} ${page.items.length === 1 ? "email" : "emails"}${before ? " (older)" : ""}`}
            />
          ) : null
        }
      >
        {page.items.length === 0 ? (
          <PanelBody flush>
            {filtered ? (
              <EmptyState
                action={
                  <Button render={<Link href={path} />} size="sm" variant="outline">
                    Clear filters
                  </Button>
                }
                compact
                description="No email matches these filters."
                icon={SearchXIcon}
                title="Nothing found"
              />
            ) : (
              <EmptyState
                action={
                  <Button
                    render={<Link href={`${base}#quick-start`} />}
                    size="sm"
                    variant="outline"
                  >
                    Quick start
                  </Button>
                }
                compact
                description="Emails sent with this environment's API keys show up here."
                icon={MailIcon}
                title="No emails yet"
              />
            )}
          </PanelBody>
        ) : (
          <EmailTable base={base} emails={page.items} />
        )}
      </Panel>
    </div>
  );
}
