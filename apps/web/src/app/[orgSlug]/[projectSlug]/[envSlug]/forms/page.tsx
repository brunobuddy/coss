import { listForms } from "@coss/forms";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { ClipboardListIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { formsUrl } from "@/lib/forms";
import { NewFormDialog } from "./form-actions";
import { formsPageContext } from "./page-context";

export const metadata: Metadata = { title: "Forms" };

const PAGE_SIZE = 50;

export default async function FormsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/forms">) {
  const { organization, environment, formsPath, can, target } = await formsPageContext(
    await params,
  );
  const search = await searchParams;
  const after = typeof search.after === "string" ? search.after : undefined;
  const url = formsUrl();
  const page = url
    ? await listForms(
        { organizationId: organization.id, environmentId: environment.id, limit: PAGE_SIZE, after },
        { publicUrl: url },
      )
    : { data: [], hasMore: false };
  const last = page.data.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={url && can({ form: ["create"] }) ? <NewFormDialog {...target} /> : null}
        description="Endpoints your site's forms post to. Every submission is screened by Risk, then delivered to webhooks, email and contacts."
        meta={<ModeBadge mode={environment.mode} />}
        title="Forms"
      />
      <Panel
        footer={
          after || page.hasMore ? (
            <CursorPager
              newestHref={after ? formsPath : undefined}
              olderHref={page.hasMore && last ? `${formsPath}?after=${last.id}` : undefined}
            />
          ) : null
        }
      >
        {page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description={
                url
                  ? "Create one here or with coss.forms.create(), then point a <form action> at its endpoint."
                  : "Forms isn't available in this deployment yet."
              }
              icon={ClipboardListIcon}
              title={after ? "No more forms" : "No forms yet"}
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hosted page</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((form) => (
                <TableRow key={form.id}>
                  <TableCell>
                    <Link className="hover:underline" href={`${formsPath}/${form.id}`}>
                      {form.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {form.disabled_by_admin ? (
                      <StatusDot tone="error">Disabled by coss.com</StatusDot>
                    ) : form.enabled ? (
                      <StatusDot tone="success">Accepting</StatusDot>
                    ) : (
                      <StatusDot tone="neutral">Off</StatusDot>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {form.hosted.enabled ? "Published" : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(form.created_at)}
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
