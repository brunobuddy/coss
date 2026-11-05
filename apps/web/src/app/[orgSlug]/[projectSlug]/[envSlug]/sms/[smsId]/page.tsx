import { getSms, listSmsEvents, SmsError } from "@coss/sms";
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
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyValue } from "@/components/copy-value";
import { SandboxBadge } from "@/components/email-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/panel";
import { SmsEventBadge, SmsStatusDot } from "@/components/sms-badges";
import { SpecItem, SpecList } from "@/components/spec-list";
import { newTicketHref } from "@/components/support/support-link";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "SMS" };

export default async function SmsDetailPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/sms/[smsId]">) {
  const { orgSlug, projectSlug, envSlug, smsId } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ sms: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const scope = { organizationId: organization.id, environmentId: found.environment.id, smsId };
  const [sms, events] = await Promise.all([
    getSms(scope).catch((error) => {
      if (error instanceof SmsError && error.code === "not_found") notFound();
      throw error;
    }),
    listSmsEvents(scope).catch(() => []),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Button
            render={
              <Link
                href={newTicketHref({
                  orgSlug,
                  from: `/${orgSlug}/${projectSlug}/${envSlug}/sms/${smsId}`,
                  reference: smsId,
                })}
              />
            }
            size="sm"
            variant="outline"
          >
            Get help
          </Button>
        }
        description={`From ${sms.from}`}
        meta={
          <>
            <SmsStatusDot status={sms.status} />
            <SandboxBadge sandbox={sms.sandbox} />
          </>
        }
        title={sms.to}
      />
      <Panel>
        <PanelBody flush>
          <SpecList columns={2}>
            <SpecItem label="ID" mono>
              <CopyValue value={sms.id} />
            </SpecItem>
            <SpecItem label="Country">{sms.country}</SpecItem>
            <SpecItem label="Segments">
              {sms.segments} ({sms.encoding === "gsm7" ? "GSM-7" : "Unicode"})
            </SpecItem>
            <SpecItem label="Created">{formatDateTime(sms.created_at)}</SpecItem>
            {sms.scheduled_at ? (
              <SpecItem label="Scheduled for">{formatDateTime(sms.scheduled_at)}</SpecItem>
            ) : null}
            <SpecItem label="Sent">{sms.sent_at ? formatDateTime(sms.sent_at) : "—"}</SpecItem>
            <SpecItem label="Delivered">
              {sms.delivered_at ? formatDateTime(sms.delivered_at) : "—"}
            </SpecItem>
            {sms.failure ? (
              <SpecItem label="Failure" mono>
                {sms.failure.code}: {sms.failure.message}
              </SpecItem>
            ) : null}
            {sms.tags.length ? (
              <SpecItem label="Tags" mono>
                {sms.tags.map((tag) => `${tag.name}=${tag.value}`).join(", ")}
              </SpecItem>
            ) : null}
            <SpecItem label="Text" stacked>
              <p className="whitespace-pre-wrap">{sms.body}</p>
            </SpecItem>
          </SpecList>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader>
          <PanelTitle>Events</PanelTitle>
        </PanelHeader>
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <SmsEventBadge type={event.type} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {event.data.failure?.message ??
                    (event.data.suppression ? `Suppressed (${event.data.suppression.reason})` : "")}
                  {event.data.provider_error_code
                    ? ` (error ${event.data.provider_error_code})`
                    : ""}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(event.occurred_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
