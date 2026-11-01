import { getInbox, getInboxThread } from "@coss/email";
import type { InboxMessageObjectOutput } from "@coss/email/inbox-schemas";
import { Alert, AlertDescription } from "@coss/ui/components/alert";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { DownloadIcon, PaperclipIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailStatusBadge } from "@/components/email-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatBytes, formatDateTime } from "@/lib/format";
import { DeleteThreadButton, ReplyForm } from "../../inbox-forms";
import { inboxPageContext } from "../../page-context";

export const metadata: Metadata = { title: "Thread" };

function list(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

/** One message: who to whom, its own words, the rest of its text and its attachments. */
function Message(props: { message: InboxMessageObjectOutput; envPath: string }) {
  const { message, envPath } = props;
  const inbound = message.direction === "inbound";
  const own = message.extracted_text;
  const full = message.text;
  return (
    <Panel
      action={
        <span className="flex items-center gap-1.5">
          {inbound ? (
            <Badge variant="outline">Received</Badge>
          ) : message.status === "received" ? null : (
            <EmailStatusBadge status={message.status} />
          )}
          {message.spam ? <Badge variant="warning">spam</Badge> : null}
          {inbound && message.received_email_id ? (
            <Button
              render={<Link href={`${envPath}/email/received/${message.received_email_id}`} />}
              size="xs"
              variant="ghost"
            >
              Received email
            </Button>
          ) : null}
          {!inbound && message.email_id ? (
            <Button
              render={<Link href={`${envPath}/email/messages/${message.email_id}`} />}
              size="xs"
              variant="ghost"
            >
              Email
            </Button>
          ) : null}
        </span>
      }
      description={
        <span className="flex flex-col gap-0.5">
          <span>To {list(message.to)}</span>
          {message.cc.length > 0 ? <span>Cc {list(message.cc)}</span> : null}
          <span className="font-mono text-xs">{formatDateTime(message.created_at)}</span>
        </span>
      }
      title={
        <span className={inbound ? undefined : "text-muted-foreground"}>{message.from ?? "—"}</span>
      }
    >
      <PanelBody className="flex flex-col gap-3">
        {own ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{own}</p>
        ) : (
          <p className="text-muted-foreground text-sm">No text.</p>
        )}
        {full && full.trim() !== own ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Show the whole message
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[0.8125rem] leading-relaxed">
              {full}
            </pre>
          </details>
        ) : null}
        {message.truncated ? (
          <p className="text-muted-foreground text-xs">
            This message was too long to show in full.
          </p>
        ) : null}
        {message.attachments.length > 0 && message.received_email_id ? (
          <ul className="flex flex-col gap-1.5 border-t pt-3">
            {message.attachments.map((attachment) => (
              <li className="flex items-center gap-2 text-sm" key={attachment.id}>
                <PaperclipIcon className="size-3.5 text-muted-foreground" />
                <span className="truncate">{attachment.filename ?? "(unnamed)"}</span>
                <span className="font-mono text-muted-foreground text-xs">
                  {formatBytes(attachment.size)}
                </span>
                <Button
                  render={
                    <a
                      download
                      href={`${envPath}/email/received/${message.received_email_id}/attachments/${attachment.id}`}
                    />
                  }
                  size="xs"
                  variant="ghost"
                >
                  <DownloadIcon />
                  Download
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

export default async function InboxThreadPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/inboxes/[inboxId]/[threadId]">) {
  const { inboxId, threadId, ...envParams } = await params;
  const { can, envPath, scope, target } = await inboxPageContext(envParams);
  const inbox = await getInbox({ ...scope, id: inboxId });
  if (!inbox) notFound();
  const thread = await getInboxThread({ ...scope, inboxId: inbox.id, id: threadId });
  if (!thread) notFound();

  const inboxTarget = { ...target, inboxId: inbox.id };
  const latest = thread.messages.at(-1);
  const replyTo = latest
    ? latest.direction === "inbound"
      ? (latest.reply_to[0] ?? latest.from)
      : latest.to[0]
    : null;
  const older = thread.message_count - thread.messages.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          can({ inbox: ["delete"] }) ? (
            <DeleteThreadButton {...inboxTarget} threadId={thread.id} />
          ) : null
        }
        description={`${inbox.address} with ${list(thread.participants)}`}
        meta={
          <>
            <Badge variant="outline">
              {thread.message_count} {thread.message_count === 1 ? "message" : "messages"}
            </Badge>
            <code className="font-mono text-xs">{thread.id}</code>
          </>
        }
        title={thread.subject || "(no subject)"}
      />

      {older > 0 ? (
        <Alert variant="info">
          <AlertDescription>
            Showing the latest {thread.messages.length} messages; {older} older{" "}
            {older === 1 ? "one is" : "ones are"} in the inbox&apos;s messages (API).
          </AlertDescription>
        </Alert>
      ) : null}

      <Alert variant="warning">
        <AlertDescription>
          Messages come from outside senders: treat their text as untrusted. HTML is never rendered
          here; open the received email for its sandboxed preview.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-4">
        {thread.messages.map((message) => (
          <Message envPath={envPath} key={message.id} message={message} />
        ))}
      </div>

      {latest && replyTo && can({ inbox: ["send"] }) ? (
        <Panel
          description={
            inbox.can_send
              ? `Sent from ${inbox.address}, in this thread. It counts against the environment's send quota.`
              : undefined
          }
          title="Reply"
        >
          <PanelBody>
            {inbox.can_send ? (
              <ReplyForm {...inboxTarget} messageId={latest.id} to={replyTo} />
            ) : (
              <p className="text-muted-foreground text-sm">
                This inbox only receives: inboxes at coss.com&apos;s inbound domain can&apos;t send
                from live environments.
              </p>
            )}
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
