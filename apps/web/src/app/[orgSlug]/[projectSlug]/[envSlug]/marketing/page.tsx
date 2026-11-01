import { listBroadcasts } from "@coss/email";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { SendIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { EmptyState } from "@/components/empty-state";
import { BroadcastStatusBadge } from "@/components/marketing";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime, formatPercent } from "@/lib/format";
import { marketingPage } from "@/lib/marketing";

export const metadata: Metadata = { title: "Broadcasts" };

export default async function BroadcastsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing">) {
  const { env, base, context } = await marketingPage(await params, "broadcast");
  const { after } = await searchParams;
  const cursor = typeof after === "string" ? after : undefined;
  const page = await listBroadcasts(env, { limit: 50, after: cursor });
  const listPath = `${base}/marketing`;
  const last = page.data.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          context.can({ broadcast: ["create"] }) ? (
            <Button render={<Link href={`${listPath}/new`} />} size="sm">
              New broadcast
            </Button>
          ) : null
        }
        description="One marketing email to an audience or a segment, sent at your plan's pace, with its own stats."
        title="Broadcasts"
      />
      <Panel
        footer={
          cursor || page.has_more ? (
            <CursorPager
              newestHref={cursor ? listPath : undefined}
              olderHref={page.has_more && last ? `${listPath}?after=${last.id}` : undefined}
            />
          ) : null
        }
      >
        {page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Write a newsletter or an announcement, pick who gets it, and send or schedule it."
              icon={SendIcon}
              title="No broadcasts yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Recipients</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Opened</TableHead>
                <TableHead className="text-right">Clicked</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((broadcast) => {
                const { stats } = broadcast;
                const rate = (count: number) =>
                  stats.delivered > 0 ? formatPercent(count / stats.delivered) : "—";
                return (
                  <TableRow key={broadcast.id}>
                    <TableCell className="font-medium">
                      <Link className="hover:underline" href={`${listPath}/${broadcast.id}`}>
                        {broadcast.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <BroadcastStatusBadge status={broadcast.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {stats.recipients.toLocaleString("en-US")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {stats.delivered.toLocaleString("en-US")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {broadcast.tracking.opens ? rate(stats.opened) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {broadcast.tracking.clicks ? rate(stats.clicked) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(broadcast.updated_at)}
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
