import { getEmail, listEmailEvents } from "@coss/email";
import { getEmailForAdmin } from "@coss/email/admin";
import { listScreeningsForAdmin } from "@coss/screening";
import { Badge } from "@coss/ui/components/badge";
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
import { listHref } from "@/components/admin/list-controls";
import { ScreeningVerdictBadge } from "@/components/admin/screening-verdict";
import {
  EmailEventBadge,
  EmailStatusBadge,
  ModeBadge,
  RecipientStatusBadge,
} from "@/components/email-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { eventDetail } from "@/lib/email-events";
import { formatBytes, formatDateTime } from "@/lib/format";
import { requirePlatformAdmin } from "@/lib/session";
import { EmailContent } from "./email-content";

export const metadata: Metadata = { title: "Email" };

function list(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

/** Any organization's email: envelope, recipients, events and screening. Content on request. */
export default async function AdminEmailPage({ params }: PageProps<"/admin/emails/[emailId]">) {
  await requirePlatformAdmin();
  const { emailId } = await params;
  const context = await getEmailForAdmin(emailId);
  if (!context) notFound();
  if (context.hipaaMode) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          description="This organization is in HIPAA mode, so staff can't see this email's subject, recipients, events or content."
          meta={
            <>
              <ModeBadge mode={context.mode} />
              <code className="font-mono text-xs">{emailId}</code>
            </>
          }
          title="Hidden (HIPAA mode)"
        />
        <Panel title="Envelope">
          <PanelBody flush>
            <SpecList>
              <SpecItem label="Organization">
                <Link
                  className="font-medium hover:underline"
                  href={`/admin/organizations/${context.organizationId}`}
                >
                  {context.organizationName}
                </Link>
              </SpecItem>
              <SpecItem label="Environment">
                {context.projectName} / {context.environmentName}
              </SpecItem>
              {context.errorCode ? (
                <SpecItem label="Error" mono>
                  {context.errorCode}
                </SpecItem>
              ) : null}
            </SpecList>
          </PanelBody>
        </Panel>
      </div>
    );
  }
  const scope = { organizationId: context.organizationId, environmentId: context.environmentId };
  const [email, events, screenings] = await Promise.all([
    getEmail({ ...scope, id: emailId }),
    listEmailEvents({ ...scope, emailId }),
    listScreeningsForAdmin({ subject: { product: "email", id: emailId }, limit: 20 }),
  ]);
  if (!email) notFound();
  const eventList = events?.events ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Button
            render={
              <Link
                href={listHref("/admin/emails", { org: context.organizationId, mode: "all" })}
              />
            }
            size="sm"
            variant="outline"
          >
            More from this organization
          </Button>
        }
        meta={
          <>
            <EmailStatusBadge status={email.status} />
            <ModeBadge mode={context.mode} />
            <code className="font-mono text-xs">{email.id}</code>
          </>
        }
        title={email.subject}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6 lg:order-2">
          <Panel title="Envelope">
            <PanelBody flush>
              <SpecList>
                <SpecItem label="Organization">
                  <Link
                    className="font-medium hover:underline"
                    href={`/admin/organizations/${context.organizationId}`}
                  >
                    {context.organizationName}
                  </Link>
                </SpecItem>
                <SpecItem label="Environment">
                  {context.projectName} / {context.environmentName}
                </SpecItem>
                <SpecItem label="API key">
                  {context.apiKeyId
                    ? `${context.apiKeyName ?? "deleted key"} (${context.apiKeyId})`
                    : "— (dashboard or internal)"}
                </SpecItem>
                <SpecItem label="From">{email.from}</SpecItem>
                <SpecItem label="To">{list(email.to)}</SpecItem>
                {email.cc.length > 0 ? <SpecItem label="Cc">{list(email.cc)}</SpecItem> : null}
                {email.bcc.length > 0 ? <SpecItem label="Bcc">{list(email.bcc)}</SpecItem> : null}
                {email.reply_to.length > 0 ? (
                  <SpecItem label="Reply-To">{list(email.reply_to)}</SpecItem>
                ) : null}
                <SpecItem label="Created" mono>
                  {formatDateTime(email.created_at)}
                </SpecItem>
                {email.scheduled_at ? (
                  <SpecItem label="Scheduled for" mono>
                    {formatDateTime(email.scheduled_at)}
                  </SpecItem>
                ) : null}
                <SpecItem label="Sent" mono>
                  {formatDateTime(email.sent_at)}
                </SpecItem>
                <SpecItem label="Category" mono>
                  {email.category ?? "—"}
                </SpecItem>
                {context.errorCode ? (
                  <SpecItem label="Error" mono stacked>
                    {context.errorCode}
                    {context.errorMessage ? `: ${context.errorMessage}` : ""}
                  </SpecItem>
                ) : null}
                {email.tags.length > 0 ? (
                  <SpecItem label="Tags" mono stacked>
                    <span className="flex flex-wrap gap-1.5">
                      {email.tags.map((tag) => (
                        <Badge className="font-mono" key={tag.name} variant="secondary">
                          {tag.name}={tag.value}
                        </Badge>
                      ))}
                    </span>
                  </SpecItem>
                ) : null}
                {Object.keys(email.headers).length > 0 ? (
                  <SpecItem label="Headers" mono stacked>
                    <pre className="whitespace-pre-wrap break-all">
                      {Object.entries(email.headers)
                        .map(([name, value]) => `${name}: ${value}`)
                        .join("\n")}
                    </pre>
                  </SpecItem>
                ) : null}
                {email.attachments.length > 0 ? (
                  <SpecItem label="Attachments" stacked>
                    {email.attachments
                      .map(
                        (attachment) => `${attachment.filename} (${formatBytes(attachment.size)})`,
                      )
                      .join(", ")}
                  </SpecItem>
                ) : null}
              </SpecList>
            </PanelBody>
          </Panel>
          <Panel
            description="Sampled live messages only. Scores are admin-only."
            title="Content screening"
          >
            {screenings.items.length === 0 ? (
              <PanelBody className="text-muted-foreground text-sm">Not screened.</PanelBody>
            ) : (
              <PanelBody flush>
                <SpecList>
                  {screenings.items.map((row) => (
                    <SpecItem
                      key={row.id}
                      label={
                        <ScreeningVerdictBadge enforced={row.enforced} verdict={row.verdict} />
                      }
                      mono
                      stacked
                    >
                      {row.verdict === "error"
                        ? (row.errorMessage ?? "error")
                        : Object.entries(row.scores)
                            .sort(([, a], [, b]) => b - a)
                            .map(([category, score]) => `${category} ${score.toFixed(2)}`)
                            .join(" · ") || "—"}
                      <div className="text-muted-foreground">
                        {row.model ?? row.classifier} · {formatDateTime(row.createdAt)}
                      </div>
                    </SpecItem>
                  ))}
                </SpecList>
              </PanelBody>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:order-1">
          <EmailContent emailId={email.id} />
          <Panel title="Recipients">
            <Table variant="card">
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last event</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {email.recipients.map((recipient) => (
                  <TableRow key={recipient.address}>
                    <TableCell className="break-all font-medium">{recipient.address}</TableCell>
                    <TableCell className="text-muted-foreground">{recipient.type}</TableCell>
                    <TableCell>
                      <RecipientStatusBadge status={recipient.status} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDateTime(recipient.last_event_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
          <Panel title="Events">
            {eventList.length === 0 ? (
              <PanelBody className="text-muted-foreground text-sm">No events yet.</PanelBody>
            ) : (
              <Table variant="card">
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventList.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap font-mono text-muted-foreground text-xs">
                        {formatDateTime(event.occurred_at)}
                      </TableCell>
                      <TableCell>
                        <EmailEventBadge type={event.type} />
                      </TableCell>
                      <TableCell className="break-all">{event.recipient ?? "All"}</TableCell>
                      <TableCell className="max-w-96 whitespace-normal break-all text-muted-foreground text-sm">
                        {eventDetail(event) || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
