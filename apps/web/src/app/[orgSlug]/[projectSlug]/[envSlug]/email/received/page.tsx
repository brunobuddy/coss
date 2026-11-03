import {
  inboundAddressFor,
  inboundDropCount,
  ListReceivedEmailsQuery,
  listEnvironmentReceivingDomains,
  listReceivedEmails,
} from "@coss/email";
import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
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
import { InboxIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyValue } from "@/components/copy-value";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge, ReceivedStatusBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SupportLink } from "@/components/support/support-link";
import { emailRuntime } from "@/lib/email-runtime";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { SimulateReceivedEmailDialog } from "./received-forms";
import { canSimulateReceiving } from "./simulate";

export const metadata: Metadata = { title: "Received emails" };

const PAGE_SIZE = 50;

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export default async function ReceivedEmailsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/received">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const search = await searchParams;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ email: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const target = { organizationId: organization.id, environmentId: environment.id };
  const inbound = emailRuntime().inbound;

  const after = single(search.after);
  const query = ListReceivedEmailsQuery.safeParse({ after, limit: PAGE_SIZE });
  const [page, address, receivingDomains, dropped] = await Promise.all([
    query.success
      ? listReceivedEmails({ ...target, limit: PAGE_SIZE, after: query.data.after })
      : null,
    inbound ? inboundAddressFor(target, inbound.managedDomain) : null,
    listEnvironmentReceivingDomains(target),
    inboundDropCount(organization.id, new Date().toISOString().slice(0, 10)),
  ]);

  const base = `/${organization.slug}/${project.slug}/${environment.slug}`;
  const listPath = `${base}/email/received`;
  const last = page?.data.at(-1);
  const nextPage =
    page?.hasMore && last ? `${listPath}?${new URLSearchParams({ after: last.id })}` : null;
  const formTarget = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
  };
  const simulate = address && can({ email: ["send"] }) && canSimulateReceiving(environment.mode);

  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          simulate ? (
            <SimulateReceivedEmailDialog {...formTarget} defaultTo={`hello@${address.domain}`} />
          ) : null
        }
        description={`Emails sent to this environment's addresses. Each one also triggers an email.received webhook. Received emails are kept for ${formatRetentionDays(RETENTION_DAYS.receivedEmails)}.`}
        meta={<ModeBadge mode={environment.mode} />}
        title="Received emails"
      />

      {dropped > 0 ? (
        <Alert variant="warning">
          <AlertDescription>
            {dropped} {dropped === 1 ? "email was" : "emails were"} dropped today because the
            organization reached its daily limit of received emails, or the Free plan's monthly
            allowance. Upgrade your plan, or{" "}
            <SupportLink
              orgSlug={organization.slug}
              subject="Raise the daily inbound limit"
              topic="sales"
            >
              contact support
            </SupportLink>{" "}
            to raise the daily limit.
          </AlertDescription>
        </Alert>
      ) : null}

      <Panel
        description={
          <>
            Email to any address at these domains is received here.{" "}
            <Link className="underline underline-offset-4" href={`${base}/email/domains`}>
              Add your own domain
            </Link>{" "}
            from a domain&apos;s page.
          </>
        }
        title="Addresses"
      >
        {!inbound ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="This deployment does not receive email."
              icon={InboxIcon}
              title="Receiving is off"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {address ? (
                <TableRow>
                  <TableCell>
                    <CopyValue display={`*@${address.domain}`} value={address.domain} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">coss.com inbound address</TableCell>
                </TableRow>
              ) : null}
              {receivingDomains.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <CopyValue display={`*@${row.hostname}`} value={row.hostname} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Link
                      className="underline underline-offset-4"
                      href={`${base}/email/domains/${row.domainId}`}
                    >
                      Your domain
                    </Link>{" "}
                    <span className="font-mono text-xs">
                      (MX {row.record.status.replaceAll("_", " ")})
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel
        footer={
          page && (page.data.length > 0 || after) ? (
            <CursorPager
              newestHref={after ? listPath : undefined}
              olderHref={nextPage ?? undefined}
              summary={`${page.data.length} ${page.data.length === 1 ? "email" : "emails"}${after ? " (older)" : ""}`}
            />
          ) : null
        }
        title="Inbox"
      >
        {!page ? (
          <PanelBody flush>
            <EmptyState
              action={
                <Button render={<Link href={listPath} />} size="sm" variant="outline">
                  Newest
                </Button>
              }
              compact
              description="This page of the inbox doesn't exist."
              icon={InboxIcon}
              title="Invalid page"
            />
          </PanelBody>
        ) : page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description={
                address
                  ? `Send an email to any address at ${address.domain} and it shows up here.`
                  : "Emails sent to this environment's addresses show up here."
              }
              icon={InboxIcon}
              title="No received emails yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Status</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((email) => (
                <TableRow key={email.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <ReceivedStatusBadge status={email.status} />
                      {email.spam ? <Badge variant="warning">spam</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-72 truncate">
                    <Link
                      className="font-medium underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${listPath}/${email.id}`}
                    >
                      {email.subject || "(no subject)"}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">
                    {email.from ?? (email.mail_from || "—")}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">
                    {email.recipients.join(", ")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-muted-foreground text-xs">
                    {formatBytes(email.size)}
                  </TableCell>
                  <TableCell
                    className="text-right font-mono text-muted-foreground text-xs"
                    title={formatDateTime(email.received_at)}
                  >
                    {formatRelative(email.received_at, now)}
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
