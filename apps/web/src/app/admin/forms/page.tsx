import { listFormsForAdmin } from "@coss/forms";
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
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { listHref, stringParam } from "@/components/admin/list-controls";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks } from "@/components/filter-links";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { requirePlatformAdmin } from "@/lib/session";
import { setFormDisabledAction } from "./actions";

export const metadata: Metadata = { title: "Forms" };

const VIEWS = [
  { value: "hosted", label: "Hosted pages" },
  { value: "all", label: "All" },
  { value: "disabled", label: "Disabled" },
];

/** Every organization's forms: hosted pages are what phishing would use. */
export default async function AdminFormsPage({ searchParams }: PageProps<"/admin/forms">) {
  await requirePlatformAdmin();
  const search = await searchParams;
  const view = VIEWS.find((option) => option.value === stringParam(search.view)) ?? VIEWS[0];
  const before = stringParam(search.before) || undefined;
  const page = await listFormsForAdmin({
    hostedOnly: view?.value === "hosted",
    disabledOnly: view?.value === "disabled",
    before,
  });
  const viewParam = view?.value === "hosted" ? undefined : view?.value;
  const last = page.data.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Forms of every organization. Disabling one makes its endpoint and hosted page answer as if it didn't exist; only an admin turns it back on."
        title="Forms"
      />
      <FilterLinks
        options={VIEWS.map((option) => ({
          value: option.value,
          label: option.label,
          href: listHref("/admin/forms", {
            view: option.value === "hosted" ? undefined : option.value,
          }),
        }))}
        value={view?.value ?? "hosted"}
      />
      <Panel
        footer={
          before || page.hasMore ? (
            <CursorPager
              newestHref={before ? listHref("/admin/forms", { view: viewParam }) : undefined}
              olderHref={
                page.hasMore && last
                  ? listHref("/admin/forms", { view: viewParam, before: last.id })
                  : undefined
              }
            />
          ) : null
        }
      >
        {page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState compact icon={ClipboardListIcon} title="No forms" />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Last 24 h</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((form) => (
                <TableRow key={form.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{form.name}</span>
                      <span className="font-mono text-muted-foreground text-xs">{form.id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      className="hover:underline"
                      href={`/admin/organizations/${form.organizationId}`}
                    >
                      {form.organizationName}
                    </Link>{" "}
                    <ModeBadge mode={form.mode} />
                  </TableCell>
                  <TableCell>
                    {form.disabledByAdminAt ? (
                      <StatusDot tone="error">Disabled</StatusDot>
                    ) : form.enabled ? (
                      <StatusDot tone="success">
                        {form.hosted ? "Hosted page" : "Accepting"}
                      </StatusDot>
                    ) : (
                      <StatusDot tone="neutral">Off</StatusDot>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {form.submissionsLastDay}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(form.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <AdminActionDialog
                      icon="form"
                      action={setFormDisabledAction}
                      description={
                        form.disabledByAdminAt
                          ? "The form accepts submissions again (if its owner has it on)."
                          : "Its endpoint and hosted page stop answering at once. The organization isn't told."
                      }
                      destructive={!form.disabledByAdminAt}
                      fields={{
                        formId: form.id,
                        disabled: form.disabledByAdminAt ? "false" : "true",
                      }}
                      reason={form.disabledByAdminAt ? "optional" : "required"}
                      submitLabel={form.disabledByAdminAt ? "Re-enable" : "Disable"}
                      success={form.disabledByAdminAt ? "Form re-enabled" : "Form disabled"}
                      title={
                        form.disabledByAdminAt ? `Re-enable ${form.name}?` : `Disable ${form.name}?`
                      }
                      triggerLabel={form.disabledByAdminAt ? "Re-enable" : "Disable"}
                    />
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
