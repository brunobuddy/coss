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
import { listVerificationsPage } from "@coss/verify";
import { VERIFICATION_STATUSES, type VerificationStatus } from "@coss/verify/schemas";
import { ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks } from "@/components/filter-links";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SearchForm } from "@/components/search-form";
import { VerificationStatusDot } from "@/components/verify-badges";
import { formatDateTime } from "@/lib/format";
import { verifyPageContext } from "./page-context";

export const metadata: Metadata = { title: "Verifications" };

const PAGE_SIZE = 50;

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "blocked", label: "Blocked" },
];

export default async function VerificationsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/verify">) {
  const { organization, environment, can, verifyPath } = await verifyPageContext(await params);
  const search = await searchParams;
  const status = single(search.status);
  const filter = (VERIFICATION_STATUSES as readonly string[]).includes(status ?? "")
    ? (status as VerificationStatus)
    : undefined;
  const to = single(search.to);
  const destination = to?.includes("@") ? to.toLowerCase() : to;
  const after = single(search.after);
  const page = await listVerificationsPage({
    organizationId: organization.id,
    environmentId: environment.id,
    to: destination,
    status: filter,
    limit: PAGE_SIZE,
    after,
  });

  const query = (extra: Record<string, string>) => {
    const values = {
      ...(filter ? { status: filter } : {}),
      ...(destination ? { to: destination } : {}),
      ...extra,
    };
    const encoded = new URLSearchParams(values).toString();
    return encoded ? `${verifyPath}?${encoded}` : verifyPath;
  };
  const last = page.data.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          can({ verify: ["update"] }) ? (
            <Button render={<Link href={`${verifyPath}/settings`} />} size="sm" variant="outline">
              Settings
            </Button>
          ) : null
        }
        description={
          environment.mode === "sandbox"
            ? "One-time codes started with this environment's keys. Sandbox codes are simulated: nothing reaches a phone or mailbox, and the code is always zeros."
            : "One-time codes started with this environment's keys, and what the fraud guard blocked before anything was sent."
        }
        meta={<ModeBadge mode={environment.mode} />}
        title="Verifications"
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterLinks
          options={FILTERS.map((option) => {
            const values = {
              ...(option.value === "all" ? {} : { status: option.value }),
              ...(destination ? { to: destination } : {}),
            };
            const encoded = new URLSearchParams(values).toString();
            return {
              value: option.value,
              label: option.label,
              href: encoded ? `${verifyPath}?${encoded}` : verifyPath,
            };
          })}
          value={filter ?? "all"}
        />
        <SearchForm
          action={verifyPath}
          keep={{ status: filter }}
          name="to"
          placeholder="+14155550123 or ada@example.com"
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
              action={
                after || filter || destination ? null : (
                  <Button render={<a href="/docs/verify" />} size="sm" variant="outline">
                    Read the docs
                  </Button>
                )
              }
              compact
              description="Start one with coss.verify.start() or POST /v1/verifications."
              icon={ShieldCheckIcon}
              title={after ? "No more verifications" : "No verifications yet"}
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((verification) => (
                <TableRow key={verification.id}>
                  <TableCell className="font-mono text-[0.8125rem]">
                    <Link className="hover:underline" href={`${verifyPath}/${verification.id}`}>
                      {verification.to}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {verification.channel === "sms" ? "SMS" : "Email"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <VerificationStatusDot status={verification.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {verification.attempts}/{verification.max_attempts}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(verification.created_at)}
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
