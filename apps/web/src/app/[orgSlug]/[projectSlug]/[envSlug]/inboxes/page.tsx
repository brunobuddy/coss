import { inboundAddressFor, listEnvironmentReceivingDomains, listInboxes } from "@coss/email";
import { ListInboxesQuery } from "@coss/email/inbox-schemas";
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
import { BotIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { emailRuntime } from "@/lib/email-runtime";
import { formatDateTime, formatRelative } from "@/lib/format";
import { CreateInboxDialog } from "./inbox-forms";
import { inboxPageContext } from "./page-context";

export const metadata: Metadata = { title: "Inboxes" };

const PAGE_SIZE = 50;

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export default async function InboxesPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/inboxes">) {
  const { can, environment, inboxesPath, scope, target } = await inboxPageContext(await params);
  const search = await searchParams;
  const inbound = emailRuntime().inbound;
  const after = single(search.after);
  const query = ListInboxesQuery.safeParse({ after, limit: PAGE_SIZE });
  const [page, address, receivingDomains] = await Promise.all([
    query.success ? listInboxes({ ...scope, limit: PAGE_SIZE, after: query.data.after }) : null,
    inbound ? inboundAddressFor(scope, inbound.managedDomain) : null,
    listEnvironmentReceivingDomains(scope),
  ]);
  const domains = [
    ...(address ? [{ value: "", label: `${address.domain} (coss.com)` }] : []),
    ...receivingDomains.map((row) => ({ value: row.hostname, label: row.hostname })),
  ];
  const create =
    can({ inbox: ["create"] }) && domains.length > 0 ? (
      <CreateInboxDialog {...target} domains={domains} />
    ) : null;

  const last = page?.data.at(-1);
  const nextPage =
    page?.hasMore && last ? `${inboxesPath}?${new URLSearchParams({ after: last.id })}` : null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={create}
        description="Email addresses for AI agents. Mail to an inbox is kept as threads, each message sends an inbox.message.received webhook, and replies go out from the same address."
        meta={<ModeBadge mode={environment.mode} />}
        title="Inboxes"
      />

      <Panel
        footer={
          page && (page.data.length > 0 || after) ? (
            <CursorPager
              newestHref={after ? inboxesPath : undefined}
              olderHref={nextPage ?? undefined}
              summary={`${page.data.length} ${page.data.length === 1 ? "inbox" : "inboxes"}${after ? " (older)" : ""}`}
            />
          ) : null
        }
      >
        {!page ? (
          <PanelBody flush>
            <EmptyState
              action={
                <Button render={<Link href={inboxesPath} />} size="sm" variant="outline">
                  Newest
                </Button>
              }
              compact
              description="This page of inboxes doesn't exist."
              icon={BotIcon}
              title="Invalid page"
            />
          </PanelBody>
        ) : page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={create}
              compact
              description={
                domains.length > 0
                  ? "Create one here or with coss.inboxes.create(): an agent gets its own address in seconds, with no DNS setup."
                  : "This deployment doesn't receive email, and the environment has no receiving domain."
              }
              icon={BotIcon}
              title="No inboxes yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Client ID</TableHead>
                <TableHead>Sending</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((inbox) => (
                <TableRow key={inbox.id}>
                  <TableCell className="max-w-80 truncate">
                    <Link
                      className="font-medium underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${inboxesPath}/${inbox.id}`}
                    >
                      {inbox.address}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">
                    {inbox.display_name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-48 truncate font-mono text-muted-foreground text-xs">
                    {inbox.client_id ?? "—"}
                  </TableCell>
                  <TableCell>
                    {inbox.can_send ? (
                      <Badge variant="outline">Send and receive</Badge>
                    ) : (
                      <Badge variant="secondary">Receive only</Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-right font-mono text-muted-foreground text-xs"
                    title={formatDateTime(inbox.created_at)}
                  >
                    {formatRelative(inbox.created_at, now)}
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
