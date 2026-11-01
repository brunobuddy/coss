import { listSmsPage } from "@coss/sms";
import { SMS_SIMULATOR, SMS_STATUSES, type SmsStatus } from "@coss/sms/schemas";
import { getEnvironment } from "@coss/tenancy";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { MessageSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks } from "@/components/filter-links";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SearchForm } from "@/components/search-form";
import { SmsStatusDot } from "@/components/sms-badges";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "SMS" };

const PAGE_SIZE = 50;

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

const FILTERS: { value: string; label: string; statuses: SmsStatus[] | undefined }[] = [
  { value: "all", label: "All", statuses: undefined },
  { value: "delivered", label: "Delivered", statuses: ["delivered"] },
  { value: "pending", label: "Pending", statuses: ["queued", "scheduled", "sent"] },
  { value: "failed", label: "Failed", statuses: ["failed", "undelivered"] },
];

export default async function SmsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/sms">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const search = await searchParams;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ sms: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;

  const filter = FILTERS.find((option) => option.value === single(search.status)) ?? FILTERS[0];
  const to = single(search.to);
  const after = single(search.after);
  const validTo = to && /^\+[1-9]\d{6,14}$/.test(to) ? to : undefined;
  const page = await listSmsPage({
    organizationId: organization.id,
    environmentId: environment.id,
    to: validTo,
    status: filter?.statuses?.filter((status) =>
      (SMS_STATUSES as readonly string[]).includes(status),
    ),
    limit: PAGE_SIZE,
    after,
  });

  const base = `/${organization.slug}/${project.slug}/${environment.slug}`;
  const listPath = `${base}/sms`;
  const query = (extra: Record<string, string>) => {
    const values = {
      ...(filter && filter.value !== "all" ? { status: filter.value } : {}),
      ...(validTo ? { to: validTo } : {}),
      ...extra,
    };
    const encoded = new URLSearchParams(values).toString();
    return encoded ? `${listPath}?${encoded}` : listPath;
  };
  const last = page.data.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          can({ smsSender: ["read"] }) ? (
            <Button render={<Link href={`${base}/sms/numbers`} />} size="sm" variant="outline">
              Numbers and registration
            </Button>
          ) : null
        }
        description={
          environment.mode === "sandbox"
            ? `Messages sent with this environment's keys. Sandbox messages are simulated: nothing reaches a phone, and the simulator's numbers (${SMS_SIMULATOR.delivered}, ${SMS_SIMULATOR.invalidNumber}, …) answer as a carrier would.`
            : "Messages sent with this environment's keys, from your organization's numbers."
        }
        meta={<ModeBadge mode={environment.mode} />}
        title="SMS"
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterLinks
          options={FILTERS.map((option) => ({
            value: option.value,
            label: option.label,
            href:
              option.value === "all"
                ? validTo
                  ? `${listPath}?${new URLSearchParams({ to: validTo })}`
                  : listPath
                : `${listPath}?${new URLSearchParams({ status: option.value, ...(validTo ? { to: validTo } : {}) })}`,
          }))}
          value={filter?.value ?? "all"}
        />
        <SearchForm
          action={listPath}
          name="to"
          placeholder="+14155550123"
          query={to ?? ""}
          type="search"
        />
      </div>

      <Panel
        footer={
          after || page.hasMore ? (
            <CursorPager
              newestHref={after ? query({}) : undefined}
              olderHref={page.hasMore && last ? query({ after: last.id }) : undefined}
            />
          ) : null
        }
      >
        {page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description={
                to && !validTo
                  ? "Search for a full number in E.164 form, like +14155550123."
                  : "Send one with coss.sms.send() or POST /v1/sms."
              }
              icon={MessageSquareIcon}
              title={after ? "No more messages" : "No messages yet"}
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Segments</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((sms) => (
                <TableRow key={sms.id}>
                  <TableCell className="font-mono text-[0.8125rem]">
                    <Link className="hover:underline" href={`${listPath}/${sms.id}`}>
                      {sms.to}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-96 truncate text-muted-foreground">
                    {sms.body}
                  </TableCell>
                  <TableCell>
                    <SmsStatusDot status={sms.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{sms.segments}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(sms.created_at)}
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
