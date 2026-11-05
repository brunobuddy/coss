import { listSmsSuppressions } from "@coss/sms";
import { getEnvironment } from "@coss/tenancy";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { MessageSquareXIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SmsSuppressionReasonBadge } from "@/components/sms-badges";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { AddSmsSuppressionDialog, RemoveSmsSuppressionButton } from "./suppression-forms";

export const metadata: Metadata = { title: "SMS suppressions" };

const PAGE_SIZE = 50;

export default async function SmsSuppressionsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/sms/suppressions">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { after: afterParam } = await searchParams;
  const after = typeof afterParam === "string" ? afterParam : undefined;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ smsSuppression: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const page = await listSmsSuppressions({
    organizationId: organization.id,
    environmentId: environment.id,
    limit: PAGE_SIZE,
    after,
  });
  const listPath = `/${organization.slug}/${project.slug}/${environment.slug}/sms/suppressions`;
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
  };
  const canDelete = can({ smsSuppression: ["delete"] });
  const last = page.data.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          can({ smsSuppression: ["create"] }) ? <AddSmsSuppressionDialog {...target} /> : null
        }
        description="Messages from this environment skip these numbers. People who reply STOP (in every live environment) and numbers that can't receive SMS are added automatically."
        meta={<ModeBadge mode={environment.mode} />}
        title="SMS suppressions"
      />
      <Panel
        footer={
          after || page.hasMore ? (
            <CursorPager
              newestHref={after ? listPath : undefined}
              olderHref={
                page.hasMore && last
                  ? `${listPath}?${new URLSearchParams({ after: last.id })}`
                  : undefined
              }
            />
          ) : null
        }
      >
        {page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Opt-outs and invalid numbers land here, along with numbers you add."
              icon={MessageSquareXIcon}
              title="No suppressed numbers"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Added</TableHead>
                {canDelete ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-[0.8125rem]">{entry.phone_number}</TableCell>
                  <TableCell>
                    <SmsSuppressionReasonBadge reason={entry.reason} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </TableCell>
                  {canDelete ? (
                    <TableCell>
                      <RemoveSmsSuppressionButton
                        {...target}
                        optOut={entry.reason === "opt_out"}
                        phoneNumber={entry.phone_number}
                        suppressionId={entry.id}
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
