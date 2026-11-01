import { getEmail, listEmailEvents, listEmailLinks } from "@coss/email";
import { getEnvironment } from "@coss/tenancy";
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
import { ActivityIcon, ScrollTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import {
  EmailEventBadge,
  EmailStatusBadge,
  RecipientStatusBadge,
  SandboxBadge,
  TrackingBadge,
} from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { eventDetail } from "@/lib/email-events";
import { PREVIEW_HEAD } from "@/lib/email-preview";
import { formatBytes, formatDateTime } from "@/lib/format";
import { environmentPath } from "@/lib/navigation";
import { requireOrgMember } from "@/lib/session";
import { CancelEmailButton } from "./cancel-email-button";
import { type EmailTab, EmailTabs } from "./email-tabs";
import { RescheduleEmailDialog } from "./reschedule-email-dialog";

export const metadata: Metadata = { title: "Email" };

function list(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

export default async function EmailPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/messages/[emailId]">) {
  const { orgSlug, projectSlug, envSlug, emailId } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ email: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  // One round trip: the events and links lookups check the email themselves (null when absent).
  const scope = { organizationId: organization.id, environmentId: environment.id };
  const [email, events, trackedLinks] = await Promise.all([
    getEmail({ ...scope, id: emailId }),
    listEmailEvents({ ...scope, emailId }),
    listEmailLinks({ ...scope, emailId }),
  ]);
  if (!email) notFound();
  const links = email.tracking.clicks ? trackedLinks : null;
  const { tracking } = email;
  const base = environmentPath(organization.slug, project.slug, environment.slug);
  const eventList = events?.events ?? [];
  const unsubscribedAt =
    eventList.find((event) => event.type === "email.unsubscribed")?.occurred_at ?? null;
  const discardedAt = email.content_storage.discarded_at;

  const content =
    email.html !== null || email.text !== null ? (
      <>
        {email.html !== null ? (
          <Panel title="HTML">
            <PanelBody className="p-2">
              <iframe
                className="h-[600px] w-full rounded-lg border bg-white"
                referrerPolicy="no-referrer"
                sandbox=""
                srcDoc={PREVIEW_HEAD + email.html}
                title="Email preview"
              />
            </PanelBody>
          </Panel>
        ) : null}
        {email.text !== null ? (
          <Panel title="Text">
            <PanelBody>
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[0.8125rem] leading-relaxed">
                {email.text}
              </pre>
            </PanelBody>
          </Panel>
        ) : null}
      </>
    ) : (
      <Panel>
        <PanelBody flush>
          <EmptyState
            compact
            description={
              discardedAt
                ? "This environment's content storage was off when the email was sent: its subject, body, headers and attachment names were discarded once it left the queue."
                : "The content of internal emails is discarded once they leave the queue."
            }
            icon={ScrollTextIcon}
            title="No content stored"
          />
        </PanelBody>
      </Panel>
    );

  const timeline = (
    <Panel description="Everything that happened to this email, oldest first." title="Events">
      {eventList.length > 0 ? (
        <PanelBody>
          <ol className="relative flex flex-col gap-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
            {eventList.map((event) => {
              const detail = eventDetail(event);
              return (
                <li className="relative flex gap-4 ps-6" key={event.id}>
                  <span
                    aria-hidden
                    className="absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-background bg-muted-foreground/48 ring-1 ring-border"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <EmailEventBadge type={event.type} />
                      <span className="break-all text-sm">
                        {event.recipient ?? "All recipients"}
                      </span>
                      <span className="ms-auto whitespace-nowrap font-mono text-muted-foreground text-xs">
                        {formatDateTime(event.occurred_at)}
                      </span>
                    </div>
                    {detail ? (
                      <p className="break-all text-muted-foreground text-sm">{detail}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </PanelBody>
      ) : (
        <PanelBody flush>
          <EmptyState
            compact
            description="Events appear as the provider reports them."
            icon={ActivityIcon}
            title="No events yet"
          />
        </PanelBody>
      )}
    </Panel>
  );

  const recipients = (
    <Panel description="Delivery status of each distinct address." title="Recipients">
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
  );

  const engagement = (
    <>
      <Panel
        description="Opens, clicks and unsubscribes, if they were on when the email was sent. Opens can be inflated by mail clients that preload images, clicks by link scanners."
        title="Engagement"
      >
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>Tracking</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>First</TableHead>
              <TableHead>Last</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Opens</TableCell>
              <TableCell>
                <TrackingBadge on={tracking.opens} />
              </TableCell>
              <TableCell className="font-mono">
                {tracking.opens ? tracking.open_count : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(tracking.first_opened_at)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(tracking.last_opened_at)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Clicks</TableCell>
              <TableCell>
                <TrackingBadge on={tracking.clicks} />
              </TableCell>
              <TableCell className="font-mono">
                {tracking.clicks ? tracking.click_count : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(tracking.first_clicked_at)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(tracking.last_clicked_at)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Unsubscribes</TableCell>
              <TableCell>
                <TrackingBadge on={tracking.unsubscribe} />
              </TableCell>
              <TableCell className="font-mono">
                {tracking.unsubscribe ? (unsubscribedAt ? 1 : 0) : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(unsubscribedAt)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(unsubscribedAt)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Panel>
      {links && links.links.length > 0 ? (
        <Panel title="Links">
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Link</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead className="text-right">Last click</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="max-w-120 whitespace-normal break-all font-mono text-xs">
                    {link.url}
                  </TableCell>
                  <TableCell className="font-mono">{link.click_count}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDateTime(link.last_clicked_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      ) : null}
    </>
  );

  const attachments =
    email.attachments.length > 0 ? (
      <Panel
        description="Only metadata is kept: coss.com discards the content once the email is sent."
        title="Attachments"
      >
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {email.attachments.map((attachment) => (
              <TableRow key={attachment.id}>
                <TableCell className="break-all font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    {attachment.filename || (
                      <span className="text-muted-foreground italic">Name not stored</span>
                    )}
                    {attachment.content_id !== null ? (
                      <Badge variant="outline">inline · cid:{attachment.content_id}</Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="break-all font-mono text-muted-foreground text-xs">
                  {attachment.content_type}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono text-xs">
                  {formatBytes(attachment.size)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    ) : null;

  const tabs: EmailTab[] = [
    { value: "content", label: "Content", content },
    {
      value: "events",
      label: (
        <>
          Events <span className="font-mono text-muted-foreground text-xs">{eventList.length}</span>
        </>
      ),
      content: timeline,
    },
    {
      value: "recipients",
      label: (
        <>
          Recipients{" "}
          <span className="font-mono text-muted-foreground text-xs">{email.recipients.length}</span>
        </>
      ),
      content: recipients,
    },
    { value: "engagement", label: "Engagement", content: engagement },
    ...(attachments
      ? [
          {
            value: "attachments",
            label: (
              <>
                Attachments{" "}
                <span className="font-mono text-muted-foreground text-xs">
                  {email.attachments.length}
                </span>
              </>
            ),
            content: attachments,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {can({ log: ["read"] }) ? (
              <Button
                render={
                  <Link
                    href={`${base}/developers/logs?${new URLSearchParams({ q: `resource:${email.id}`, range: "30d" })}`}
                  />
                }
                size="sm"
                variant="outline"
              >
                View logs
              </Button>
            ) : null}
            {email.status === "scheduled" && can({ email: ["send"] }) ? (
              <div className="flex gap-2">
                {email.scheduled_at ? (
                  <RescheduleEmailDialog
                    emailId={email.id}
                    envSlug={environment.slug}
                    orgSlug={organization.slug}
                    projectSlug={project.slug}
                    scheduledAt={email.scheduled_at}
                  />
                ) : null}
                <CancelEmailButton
                  emailId={email.id}
                  envSlug={environment.slug}
                  orgSlug={organization.slug}
                  projectSlug={project.slug}
                />
              </div>
            ) : null}
          </>
        }
        meta={
          <>
            <EmailStatusBadge status={email.status} />
            <SandboxBadge sandbox={email.sandbox} />
            <code className="font-mono text-xs">{email.id}</code>
          </>
        }
        title={discardedAt ? "Content not stored" : email.subject}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 lg:order-2">
          <Panel action={<CopyButton label="Copy ID" value={email.id} />} title="Envelope">
            <PanelBody flush>
              <SpecList>
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
                {email.content_storage.mode === "discard" ? (
                  <SpecItem label="Content" mono>
                    {discardedAt
                      ? `Discarded ${formatDateTime(discardedAt)}`
                      : "Discarded once sent"}
                  </SpecItem>
                ) : null}
                {email.batch_id ? (
                  <SpecItem label="Batch" mono>
                    {email.batch_id}
                  </SpecItem>
                ) : null}
                {email.template ? (
                  <SpecItem label="Template" mono>
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`${base}/email/templates/${email.template.id}`}
                    >
                      {email.template.version === null
                        ? "Draft (test send)"
                        : `Version ${email.template.version}`}{" "}
                      · {email.template.locale}
                    </Link>
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
              </SpecList>
            </PanelBody>
          </Panel>
        </div>
        <div className="min-w-0 lg:order-1">
          <EmailTabs tabs={tabs} />
        </div>
      </div>
    </div>
  );
}
