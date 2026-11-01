import { listSegments } from "@coss/email";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { FilterIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { marketingPage } from "@/lib/marketing";

export const metadata: Metadata = { title: "Segments" };

export default async function SegmentsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/segments">) {
  const { env, base, context } = await marketingPage(await params);
  const { after } = await searchParams;
  const cursor = typeof after === "string" ? after : undefined;
  const page = await listSegments(env, { limit: 50, after: cursor });
  const listPath = `${base}/marketing/segments`;
  const last = page.data.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          context.can({ contact: ["create"] }) ? (
            <Button render={<Link href={`${listPath}/new`} />} size="sm">
              New segment
            </Button>
          ) : null
        }
        description="Filters over this environment's contacts, evaluated whenever they're used, so they're always current."
        title="Segments"
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
              description="Filter contacts by their properties, audiences, topics or email domain."
              icon={FilterIcon}
              title="No segments yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((segment) => (
                <TableRow key={segment.id}>
                  <TableCell className="font-medium">
                    <Link className="hover:underline" href={`${listPath}/${segment.id}`}>
                      {segment.name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {segment.filter.conditions.length} ({segment.filter.match})
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(segment.updated_at)}
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
