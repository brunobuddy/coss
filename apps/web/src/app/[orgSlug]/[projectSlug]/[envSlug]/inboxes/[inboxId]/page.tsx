import { getInbox, listInboxThreads } from "@coss/email";
import { ListInboxThreadsQuery } from "@coss/email/inbox-schemas";
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
import { MessagesSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyValue } from "@/components/copy-value";
import { CursorPager } from "@/components/cursor-pager";
import { SandboxBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime, formatRelative } from "@/lib/format";
import { DeleteInboxButton, RenameInboxDialog } from "../inbox-forms";
import { inboxPageContext } from "../page-context";

export const metadata: Metadata = { title: "Inbox" };

const PAGE_SIZE = 50;

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export default async function InboxPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/inboxes/[inboxId]">) {
  const { inboxId, ...envParams } = await params;
  const { can, inboxesPath, scope, target } = await inboxPageContext(envParams);
  const search = await searchParams;
  const inbox = await getInbox({ ...scope, id: inboxId });
  if (!inbox) notFound();
  const after = single(search.after);
  const query = ListInboxThreadsQuery.safeParse({ after, limit: PAGE_SIZE });
  const page = query.success
    ? await listInboxThreads({
        ...scope,
        inboxId: inbox.id,
        limit: PAGE_SIZE,
        after: query.data.after,
      })
    : null;

  const inboxPath = `${inboxesPath}/${inbox.id}`;
  const inboxTarget = { ...target, inboxId: inbox.id };
  const last = page?.data.at(-1);
  const nextPage =
    page?.hasMore && last ? `${inboxPath}?${new URLSearchParams({ after: last.id })}` : null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {can({ inbox: ["update"] }) ? (
              <RenameInboxDialog {...inboxTarget} displayName={inbox.display_name} />
            ) : null}
            {can({ inbox: ["delete"] }) ? (
              <DeleteInboxButton {...inboxTarget} address={inbox.address} />
            ) : null}
          </>
        }
        meta={
          <>
            <SandboxBadge sandbox={inbox.sandbox} />
            {inbox.can_send ? null : <Badge variant="secondary">Receive only</Badge>}
            <code className="font-mono text-xs">{inbox.id}</code>
            {inbox.client_id ? (
              <code className="font-mono text-xs">client {inbox.client_id}</code>
            ) : null}
          </>
        }
        title={inbox.display_name ?? inbox.address}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Address</span>
        <CopyValue value={inbox.address} />
      </div>

      {inbox.can_send ? null : (
        <Alert variant="info">
          <AlertDescription>
            Inboxes at coss.com&apos;s inbound domain only receive in live environments. To reply
            from an inbox, create it at a receiving domain under one of your verified domains.
          </AlertDescription>
        </Alert>
      )}

      <Panel
        footer={
          page && (page.data.length > 0 || after) ? (
            <CursorPager
              newestHref={after ? inboxPath : undefined}
              olderHref={nextPage ?? undefined}
              summary={`${page.data.length} ${page.data.length === 1 ? "thread" : "threads"}${after ? " (older)" : ""}`}
            />
          ) : null
        }
        title="Threads"
      >
        {!page ? (
          <PanelBody flush>
            <EmptyState
              action={
                <Button render={<Link href={inboxPath} />} size="sm" variant="outline">
                  Newest
                </Button>
              }
              compact
              description="This page of threads doesn't exist."
              icon={MessagesSquareIcon}
              title="Invalid page"
            />
          </PanelBody>
        ) : page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description={`Send an email to ${inbox.address} and it shows up here as a thread.`}
              icon={MessagesSquareIcon}
              title="No threads yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Participants</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead className="text-right">Latest</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((thread) => {
                const awaitsReply = thread.last_inbound_at === thread.last_message_at;
                return (
                  <TableRow key={thread.id}>
                    <TableCell className="max-w-96">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-2">
                          {awaitsReply ? (
                            <StatusDot tone="info">
                              <span className="sr-only">Awaiting reply</span>
                            </StatusDot>
                          ) : null}
                          <Link
                            className="truncate font-medium underline-offset-4 before:absolute before:inset-0 hover:underline"
                            href={`${inboxPath}/${thread.id}`}
                          >
                            {thread.subject || "(no subject)"}
                          </Link>
                        </span>
                        {thread.preview ? (
                          <span className="truncate text-muted-foreground text-xs">
                            {thread.preview}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">
                      {thread.participants.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground text-xs">
                      {thread.message_count}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-right font-mono text-muted-foreground text-xs"
                      title={formatDateTime(thread.last_message_at)}
                    >
                      {formatRelative(thread.last_message_at, now)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
