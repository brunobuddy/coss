import { getAudience, listAudienceContacts } from "@coss/email";
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
import { CursorPager } from "@/components/cursor-pager";
import { ContactStatusBadge } from "@/components/marketing";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { marketingPage } from "@/lib/marketing";
import {
  AddMembersForm,
  DeleteAudienceButton,
  RemoveMemberButton,
  RenameAudienceForm,
} from "../audience-forms";

export const metadata: Metadata = { title: "Audience" };

export default async function AudiencePage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/audiences/[audienceId]">) {
  const resolved = await params;
  const { env, base, target, context } = await marketingPage(resolved);
  const audience = await getAudience(env, resolved.audienceId);
  if (!audience) notFound();
  const { after } = await searchParams;
  const cursor = typeof after === "string" ? after : undefined;
  const members = await listAudienceContacts(env, audience.id, { limit: 50, after: cursor });
  const path = `${base}/marketing/audiences/${audience.id}`;
  const last = members?.data.at(-1);
  const canEdit = context.can({ contact: ["update"] });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          context.can({ contact: ["delete"] }) ? (
            <DeleteAudienceButton {...target} audienceId={audience.id} name={audience.name} />
          ) : null
        }
        description={`${audience.contact_count.toLocaleString("en-US")} ${audience.contact_count === 1 ? "contact" : "contacts"}.`}
        title={audience.name}
      />
      {canEdit ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Add contacts">
            <PanelBody>
              <AddMembersForm {...target} audienceId={audience.id} />
            </PanelBody>
          </Panel>
          <Panel title="Settings">
            <PanelBody>
              <RenameAudienceForm {...target} audienceId={audience.id} name={audience.name} />
            </PanelBody>
          </Panel>
        </div>
      ) : null}
      <Panel
        footer={
          cursor || members?.has_more ? (
            <CursorPager
              newestHref={cursor ? path : undefined}
              olderHref={members?.has_more && last ? `${path}?after=${last.id}` : undefined}
            />
          ) : null
        }
        title="Members"
      >
        {!members || members.data.length === 0 ? (
          <PanelBody>
            <p className="text-muted-foreground text-sm">No contacts in this audience yet.</p>
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                {canEdit ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">
                    <Link
                      className="hover:underline"
                      href={`${base}/marketing/contacts/${contact.id}`}
                    >
                      {contact.email}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ContactStatusBadge status={contact.status} />
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <RemoveMemberButton
                        {...target}
                        audienceId={audience.id}
                        contactId={contact.id}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
