import { listAudiences } from "@coss/email";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { UsersRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { marketingPage } from "@/lib/marketing";
import { CreateAudienceDialog } from "./audience-forms";

export const metadata: Metadata = { title: "Audiences" };

export default async function AudiencesPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/audiences">) {
  const { env, base, target, context } = await marketingPage(await params);
  const { after } = await searchParams;
  const cursor = typeof after === "string" ? after : undefined;
  const page = await listAudiences(env, { limit: 50, after: cursor });
  const listPath = `${base}/marketing/audiences`;
  const last = page.data.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={context.can({ contact: ["create"] }) ? <CreateAudienceDialog {...target} /> : null}
        description="Static lists of contacts. A broadcast to an audience goes to its subscribed members."
        title="Audiences"
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
              action={
                context.can({ contact: ["create"] }) ? <CreateAudienceDialog {...target} /> : null
              }
              description="Group contacts into lists to send broadcasts to them."
              icon={UsersRoundIcon}
              title="No audiences yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((audience) => (
                <TableRow key={audience.id}>
                  <TableCell className="font-medium">
                    <Link className="hover:underline" href={`${listPath}/${audience.id}`}>
                      {audience.name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {audience.contact_count.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(audience.created_at)}
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
