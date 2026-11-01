import { contactCount, listContacts } from "@coss/email";
import { CONTACT_STATUSES, ListContactsQuery } from "@coss/email/contact-schemas";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { ContactRoundIcon, DownloadIcon, SearchXIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks } from "@/components/filter-links";
import { ContactStatusBadge } from "@/components/marketing";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SearchForm } from "@/components/search-form";
import { formatDateTime } from "@/lib/format";
import { listAllAudiences, marketingPage } from "@/lib/marketing";
import { AddContactDialog, ImportContactsDialog } from "./contact-dialogs";

export const metadata: Metadata = { title: "Contacts" };

const PAGE_SIZE = 50;

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export default async function ContactsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/contacts">) {
  const page = await marketingPage(await params);
  const search = await searchParams;
  const { env, base, target, environment, context } = page;

  const email = single(search.email);
  const status = single(search.status);
  const after = single(search.after);
  const query = ListContactsQuery.safeParse({
    email,
    status: CONTACT_STATUSES.includes(status as never) ? status : undefined,
    after,
    limit: PAGE_SIZE,
  });
  const [contacts, total, audiences] = await Promise.all([
    query.success ? listContacts(env, query.data) : null,
    contactCount(env),
    listAllAudiences(env),
  ]);
  const listPath = `${base}/marketing/contacts`;
  const filters = {
    ...(email ? { email } : {}),
    ...(query.success && query.data.status ? { status: query.data.status } : {}),
  };
  const last = contacts?.data.at(-1);
  const nextPage =
    contacts?.has_more && last
      ? `${listPath}?${new URLSearchParams({ ...filters, after: last.id })}`
      : null;
  const canCreate = context.can({ contact: ["create", "update"] });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            <Button render={<Link href={`${listPath}/properties`} />} size="sm" variant="ghost">
              Properties
            </Button>
            <Button render={<a download href={`${listPath}/export`} />} size="sm" variant="outline">
              <DownloadIcon />
              Export CSV
            </Button>
            {canCreate ? (
              <ImportContactsDialog
                {...target}
                audiences={audiences.data.map((a) => ({ id: a.id, name: a.name }))}
              />
            ) : null}
            {canCreate ? <AddContactDialog {...target} base={base} /> : null}
          </>
        }
        description={`The people this environment's marketing email goes to, with their consent. ${total.toLocaleString("en-US")} ${total === 1 ? "contact" : "contacts"}.`}
        meta={<ModeBadge mode={environment.mode} />}
        title="Contacts"
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchForm
          action={listPath}
          name="email"
          placeholder="Find an address"
          query={email ?? ""}
          type="email"
        />
        <FilterLinks
          value={query.success ? (query.data.status ?? "") : ""}
          options={[
            { value: "", label: "All", href: listPath },
            ...CONTACT_STATUSES.map((value) => ({
              value,
              label: value[0]?.toUpperCase() + value.slice(1),
              href: `${listPath}?${new URLSearchParams({ status: value })}`,
            })),
          ]}
        />
      </div>

      <Panel
        footer={
          after || nextPage ? (
            <CursorPager
              newestHref={after ? `${listPath}?${new URLSearchParams(filters)}` : undefined}
              olderHref={nextPage ?? undefined}
            />
          ) : null
        }
      >
        {!contacts ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Search for a full email address, like ada@example.com."
              icon={SearchXIcon}
              title="Enter a valid email address"
            />
          </PanelBody>
        ) : contacts.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description={
                email || status
                  ? "No contact matches."
                  : "Add contacts here, import a CSV, or upsert them with the API."
              }
              icon={email ? SearchXIcon : ContactRoundIcon}
              title={email || status ? "No contacts found" : "No contacts yet"}
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.data.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="max-w-80 truncate font-medium">
                    <Link className="hover:underline" href={`${listPath}/${contact.id}`}>
                      {contact.email}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell>
                    <ContactStatusBadge status={contact.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(contact.created_at)}
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
