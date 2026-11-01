import { getReceivedEmail } from "@coss/email";
import { getEnvironment } from "@coss/tenancy";
import { Alert, AlertDescription } from "@coss/ui/components/alert";
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
import { DownloadIcon, MailIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { ReceivedStatusBadge, SandboxBadge, VerdictBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { UNTRUSTED_PREVIEW_HEAD } from "@/lib/email-preview";
import { formatBytes, formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { type EmailTab, EmailTabs } from "../../messages/[emailId]/email-tabs";
import { DeleteReceivedEmailButton } from "../received-forms";

export const metadata: Metadata = { title: "Received email" };

function list(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

export default async function ReceivedEmailPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/received/[receivedId]">) {
  const { orgSlug, projectSlug, envSlug, receivedId } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ email: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const email = await getReceivedEmail({
    organizationId: organization.id,
    environmentId: environment.id,
    id: receivedId,
  });
  if (!email) notFound();

  const listPath = `/${organization.slug}/${project.slug}/${environment.slug}/email/received`;
  const emailPath = `${listPath}/${email.id}`;
  const { verdicts } = email;

  const content =
    email.html !== null || email.text !== null ? (
      <>
        {email.html !== null ? (
          <Panel description="Remote images and other content are not loaded." title="HTML">
            <PanelBody className="p-2">
              <iframe
                className="h-[600px] w-full rounded-lg border bg-white"
                referrerPolicy="no-referrer"
                sandbox=""
                srcDoc={UNTRUSTED_PREVIEW_HEAD + email.html}
                title="Received email preview"
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
              email.status === "blocked"
                ? "Blocked messages are never stored."
                : "This email has no HTML or text body."
            }
            icon={MailIcon}
            title="No content"
          />
        </PanelBody>
      </Panel>
    );

  const attachments =
    email.attachments.length > 0 ? (
      <Panel
        description="Sent by an outside sender: open them only if you trust it."
        title="Attachments"
      >
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {email.attachments.map((attachment) => (
              <TableRow key={attachment.id}>
                <TableCell className="max-w-72 truncate font-medium">
                  {attachment.filename ?? "(unnamed)"}
                  {attachment.disposition === "inline" ? (
                    <span className="font-normal text-muted-foreground"> (inline)</span>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground text-xs">
                  {attachment.content_type}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground text-xs">
                  {formatBytes(attachment.size)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    render={<a download href={`${emailPath}/attachments/${attachment.id}`} />}
                    size="sm"
                    variant="outline"
                  >
                    <DownloadIcon />
                    Download
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    ) : null;

  const headers =
    email.headers.length > 0 ? (
      <Panel title="Headers">
        <PanelBody className="max-h-[480px] overflow-auto" flush>
          <dl className="font-mono text-xs">
            {email.headers.map((header, index) => (
              <div
                className="grid gap-1 border-t px-5 py-2 first:border-t-0 sm:grid-cols-[14rem_1fr] sm:gap-4"
                // Headers repeat (Received), so their position is part of the key.
                // biome-ignore lint/suspicious/noArrayIndexKey: the list never reorders.
                key={`${index}-${header.name}`}
              >
                <dt className="text-muted-foreground">{header.name}</dt>
                <dd className="break-all">{header.value}</dd>
              </div>
            ))}
          </dl>
        </PanelBody>
      </Panel>
    ) : null;

  const tabs: EmailTab[] = [
    { value: "content", label: "Content", content },
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
    ...(headers
      ? [
          {
            value: "headers",
            label: (
              <>
                Headers{" "}
                <span className="font-mono text-muted-foreground text-xs">
                  {email.headers.length}
                </span>
              </>
            ),
            content: headers,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {email.status === "received" ? (
              <Button render={<a download href={`${emailPath}/raw`} />} size="sm" variant="outline">
                <DownloadIcon />
                Download .eml
              </Button>
            ) : null}
            {can({ receivedEmail: ["delete"] }) ? (
              <DeleteReceivedEmailButton
                envSlug={environment.slug}
                orgSlug={organization.slug}
                projectSlug={project.slug}
                receivedEmailId={email.id}
              />
            ) : null}
          </>
        }
        meta={
          <>
            <ReceivedStatusBadge status={email.status} />
            {email.spam ? <Badge variant="warning">spam</Badge> : null}
            <SandboxBadge sandbox={email.sandbox} />
            <code className="font-mono text-xs">{email.id}</code>
          </>
        }
        title={email.subject || "(no subject)"}
      />

      {email.status === "blocked" ? (
        <Alert variant="error">
          <AlertDescription>
            This message carried a virus, so its content was never stored or announced by webhook.
          </AlertDescription>
        </Alert>
      ) : null}
      {email.truncated ? (
        <Alert variant="info">
          <AlertDescription>
            Some of this email&apos;s headers or bodies were too long to show in full; download the
            .eml for all of it.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6 lg:order-2">
          <Panel action={<CopyButton label="Copy ID" value={email.id} />} title="Envelope">
            <PanelBody flush>
              <SpecList>
                <SpecItem label="From">{email.from ?? "—"}</SpecItem>
                <SpecItem label="To">{list(email.to)}</SpecItem>
                {email.cc.length > 0 ? <SpecItem label="Cc">{list(email.cc)}</SpecItem> : null}
                {email.reply_to.length > 0 ? (
                  <SpecItem label="Reply-To">{list(email.reply_to)}</SpecItem>
                ) : null}
                <SpecItem label="Envelope sender">{email.mail_from || "—"}</SpecItem>
                <SpecItem label="Received for">{list(email.recipients)}</SpecItem>
                <SpecItem label="Received" mono>
                  {formatDateTime(email.received_at)}
                </SpecItem>
                <SpecItem label="Date header" mono>
                  {formatDateTime(email.sent_at)}
                </SpecItem>
                <SpecItem label="Size" mono>
                  {formatBytes(email.size)}
                </SpecItem>
                {email.message_id ? (
                  <SpecItem label="Message-ID" mono stacked>
                    {email.message_id}
                  </SpecItem>
                ) : null}
                {email.in_reply_to ? (
                  <SpecItem label="In-Reply-To" mono stacked>
                    {email.in_reply_to}
                  </SpecItem>
                ) : null}
              </SpecList>
            </PanelBody>
          </Panel>
          <Panel title="Verdicts">
            <PanelBody>
              <span className="flex flex-wrap gap-1.5">
                <VerdictBadge label="spam" verdict={verdicts.spam} />
                <VerdictBadge label="virus" verdict={verdicts.virus} />
                <VerdictBadge label="SPF" verdict={verdicts.spf} />
                <VerdictBadge label="DKIM" verdict={verdicts.dkim} />
                <VerdictBadge label="DMARC" verdict={verdicts.dmarc} />
                {verdicts.dmarc_policy ? (
                  <Badge variant="outline">DMARC policy: {verdicts.dmarc_policy}</Badge>
                ) : null}
              </span>
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
