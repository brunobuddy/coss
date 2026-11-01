import { listReceivedSms } from "@coss/sms";
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
import { MessageSquareReplyIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "Received SMS" };

const PAGE_SIZE = 50;

export default async function ReceivedSmsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/sms/received">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { after: afterParam } = await searchParams;
  const after = typeof afterParam === "string" ? afterParam : undefined;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ sms: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const page = await listReceivedSms({
    organizationId: organization.id,
    environmentId: environment.id,
    limit: PAGE_SIZE,
    after,
  });
  const listPath = `/${organization.slug}/${project.slug}/${environment.slug}/sms/received`;
  const last = page.data.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Replies and other messages to your organization's numbers whose replies come to this environment (set on each number). STOP and START are applied to every live environment's suppression list whatever the number's setting."
        meta={<ModeBadge mode={environment.mode} />}
        title="Received SMS"
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
              description={
                environment.mode === "sandbox"
                  ? "Send to the simulator's reply number, +15005550008, to get a simulated reply here."
                  : "Replies to your numbers land here once a number sends its replies to this environment."
              }
              icon={MessageSquareReplyIcon}
              title="Nothing received yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((message) => (
                <TableRow key={message.id}>
                  <TableCell className="font-mono text-[0.8125rem]">{message.from}</TableCell>
                  <TableCell className="font-mono text-[0.8125rem]">{message.to}</TableCell>
                  <TableCell className="max-w-96">
                    <span className="flex items-center gap-2">
                      {message.keyword ? (
                        <Badge variant="secondary">{message.keyword}</Badge>
                      ) : null}
                      <span className="truncate">{message.body}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(message.created_at)}
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
