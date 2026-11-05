import { environmentHref } from "@coss/dashboard-routes";
import {
  DMARC_READINESS,
  dmarcDailySeries,
  dmarcOverview,
  getDomain,
  listDmarcReports,
} from "@coss/email";
import { type DomainDmarcOutput, ListDmarcReportsQuery } from "@coss/email/schemas";
import { RETENTION_DAYS } from "@coss/retention";
import { Alert, AlertDescription } from "@coss/ui/components/alert";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { cn } from "@coss/ui/lib/utils";
import { FileChartColumnIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StackedBars } from "@/components/charts/stacked-bars";
import { CopyValue } from "@/components/copy-value";
import { CursorPager } from "@/components/cursor-pager";
import { DomainStatusBadge } from "@/components/domain-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { Stat, StatRow } from "@/components/stat-row";
import { StatusDot } from "@/components/status-dot";
import { SubNav } from "@/components/sub-nav";
import { dmarcComplete, dmarcNoNextStep } from "@/lib/dmarc-status";
import { emailRuntime } from "@/lib/email-runtime";
import { formatDateTime, formatRelative } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { VerifyDomainButton } from "../domain-actions";
import { SampleReportButton } from "./dmarc-actions";
import { canSimulateDmarcReports } from "./simulate";

export const metadata: Metadata = { title: "DMARC" };

const CHART_DAYS = 30;
const PAGE_SIZE = 20;
const count = new Intl.NumberFormat("en");
const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

const STEPS = [
  { label: "Publish a record", detail: "Any v=DMARC1 record at _dmarc" },
  { label: "Monitor", detail: "p=none: reports, no effect on delivery" },
  { label: "Quarantine", detail: "p=quarantine: failing mail goes to spam" },
  { label: "Reject", detail: "p=reject: failing mail is refused" },
] as const;

const STAGE_INDEX: Record<DomainDmarcOutput["stage"], number> = {
  not_checked: 0,
  no_record: 0,
  monitoring: 1,
  quarantine: 2,
  reject: 3,
};

const NEXT_TITLE: Record<NonNullable<DomainDmarcOutput["next"]>["kind"], string> = {
  publish: "Publish a DMARC record",
  add_reporting: "Send DMARC reports to coss.com",
  complete_rollout: "Apply the policy to all mail",
  tighten: "Move to a stricter policy",
};

/** A pass rate with one decimal: 99.4% and 100% read differently here. */
function rate(passing: number, total: number): string {
  if (total === 0) return "—";
  const value = (passing / total) * 100;
  return `${value === 100 || value === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function Stepper({ dmarc }: { dmarc: DomainDmarcOutput }) {
  const current = STAGE_INDEX[dmarc.stage];
  const complete = dmarcComplete(dmarc);
  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
      {STEPS.map((step, index) => {
        const done = index < current || (index === current && index === 3 && complete);
        const active = index === current && !done;
        return (
          <li
            className={cn("flex flex-col gap-1 bg-card px-4 py-3", active && "bg-accent/40")}
            key={step.label}
          >
            <StatusDot tone={done ? "success" : active ? "info" : "neutral"}>
              <span
                className={cn("font-medium text-sm", !done && !active && "text-muted-foreground")}
              >
                {index + 1}. {step.label}
              </span>
            </StatusDot>
            <span className="text-muted-foreground text-xs">{step.detail}</span>
          </li>
        );
      })}
    </ol>
  );
}

function NextStep({ dmarc, domainName }: { dmarc: DomainDmarcOutput; domainName: string }) {
  const { next } = dmarc;
  if (!next) return <p className="text-sm">{dmarcNoNextStep(dmarc, domainName)}</p>;
  const status =
    next.kind === "tighten" || next.kind === "complete_rollout" ? (
      dmarc.ready ? (
        <StatusDot tone="success">Ready</StatusDot>
      ) : (
        <StatusDot tone="warning">Not ready yet</StatusDot>
      )
    ) : (
      <StatusDot tone="info">Safe to publish</StatusDot>
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading font-semibold">{NEXT_TITLE[next.kind]}</h3>
        <span className="text-sm">{status}</span>
      </div>
      <p className="text-muted-foreground text-sm">
        {next.kind === "publish"
          ? "Start by monitoring: p=none changes nothing about delivery, but mailbox providers start sending reports about every source that sends as this domain."
          : next.kind === "add_reporting"
            ? "Your record doesn't send aggregate reports to coss.com yet. This keeps your policy and your other report addresses, and adds coss.com's."
            : next.kind === "complete_rollout"
              ? "Your record applies its policy to only part of the mail (pct or t=y). RFC 9989 removed pct; once the checks below pass, apply it in full."
              : next.policy === "quarantine"
                ? "With quarantine, mailbox providers move mail that fails DMARC to spam. Publish it once every check below passes."
                : `With reject, mailbox providers refuse mail that fails DMARC. Quarantine first runs for ${DMARC_READINESS.daysAtQuarantine} days to make sure none of your own mail is caught.`}
      </p>
      <div className="flex flex-col gap-1 rounded-lg border bg-background px-3 py-2">
        <span className="text-muted-foreground text-xs">TXT record at _dmarc.{domainName}</span>
        <CopyValue value={next.record} />
      </div>
      {dmarc.checks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {dmarc.checks.map((check) => (
            <li className="text-sm" key={check.id}>
              <StatusDot tone={check.ok ? "success" : "warning"}>
                <span className="whitespace-normal">{check.message}</span>
              </StatusDot>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default async function DomainDmarcPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/domains/[domainId]/dmarc">) {
  const { orgSlug, projectSlug, envSlug, domainId } = await params;
  const envBase = environmentHref({
    organization: orgSlug,
    project: projectSlug,
    environment: envSlug,
  });
  const search = await searchParams;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ domain: ["read"] })) notFound();
  const domain = await getDomain({ organizationId: organization.id, id: domainId });
  if (!domain) notFound();
  const scope = { organizationId: organization.id, domainId: domain.id };
  const after = single(search.after);
  const query = ListDmarcReportsQuery.safeParse({ after, limit: PAGE_SIZE });
  const [dmarc, series, page] = await Promise.all([
    dmarcOverview(domain, emailRuntime().domainDeps.dmarcReportDomain ?? null),
    dmarcDailySeries({ ...scope, days: CHART_DAYS }),
    query.success
      ? listDmarcReports({ ...scope, limit: PAGE_SIZE, after: query.data.after })
      : null,
  ]);
  const base = `${envBase}/email/domains/${domain.id}`;
  const listPath = `${base}/dmarc`;
  const last = page?.data.at(-1);
  const nextPage =
    page?.hasMore && last ? `${listPath}?${new URLSearchParams({ after: last.id })}` : null;
  const canVerify = can({ domain: ["verify"] });
  const summary = dmarc.report_summary;
  const unauthenticated =
    summary.messages - summary.passing - (summary.coss_messages - summary.coss_passing);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          canVerify ? (
            <>
              {canSimulateDmarcReports() ? (
                <SampleReportButton domainId={domain.id} orgSlug={organization.slug} />
              ) : null}
              {domain.status !== "deleting" && domain.status !== "failed" ? (
                <VerifyDomainButton
                  domainId={domain.id}
                  orgSlug={organization.slug}
                  restart={false}
                />
              ) : null}
            </>
          ) : null
        }
        description="Who sends as this domain, whether their mail authenticates, and the path from monitoring to rejecting spoofed mail."
        meta={<DomainStatusBadge status={domain.status} />}
        title={<span className="font-mono tracking-[-0.03em]">{domain.name}</span>}
      />
      <SubNav base={base} className="border-b" nav="domain" />

      {dmarc.warnings.map((warning) => (
        <Alert key={warning} variant="warning">
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

      <Panel title="Policy">
        <PanelBody className="flex flex-col gap-6">
          <Stepper dmarc={dmarc} />
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <NextStep dmarc={dmarc} domainName={domain.name} />
            </div>
            <SpecList className="px-0 lg:col-span-2" columns={1}>
              <SpecItem label="Published record" mono stacked>
                {dmarc.record ? (
                  <span className="break-all">{dmarc.record.value}</span>
                ) : dmarc.stage === "not_checked" ? (
                  <span className="text-muted-foreground">Not checked yet</span>
                ) : dmarc.inherited_from ? (
                  <span className="text-muted-foreground">
                    None of its own: {dmarc.inherited_from}'s applies
                  </span>
                ) : (
                  <span className="text-muted-foreground">None found</span>
                )}
              </SpecItem>
              <SpecItem label="Policy since">{formatDateTime(dmarc.policy_since)}</SpecItem>
              <SpecItem label="Reports">
                {dmarc.reporting ? (
                  <StatusDot tone="success">Sent to coss.com</StatusDot>
                ) : (
                  <StatusDot tone="neutral">Not sent to coss.com</StatusDot>
                )}
              </SpecItem>
              {dmarc.report_address ? (
                <SpecItem label="Report address" stacked>
                  <CopyValue value={dmarc.report_address} />
                </SpecItem>
              ) : null}
            </SpecList>
          </div>
        </PanelBody>
      </Panel>

      <StatRow>
        <Stat
          detail={`last ${DMARC_READINESS.windowDays} days`}
          label="Messages reported"
          value={count.format(summary.messages)}
        />
        <Stat
          detail={`${count.format(summary.passing)} passed`}
          label="DMARC pass rate"
          value={rate(summary.passing, summary.messages)}
        />
        <Stat
          detail={`${count.format(summary.coss_messages)} messages`}
          label="Sent through coss.com"
          value={rate(summary.coss_passing, summary.coss_messages)}
        />
        <Stat
          detail="failing, not through coss.com"
          label="Unauthenticated"
          value={count.format(Math.max(0, unauthenticated))}
        />
      </StatRow>

      <Panel
        action={
          <span className="font-mono text-muted-foreground text-xs">
            last {CHART_DAYS} days · UTC
          </span>
        }
        title="Messages"
      >
        <PanelBody>
          <StackedBars
            columns={series.map((day) => ({
              label: dayLabel.format(new Date(`${day.day}T00:00:00Z`)),
              values: {
                passing: day.passing,
                none: day.none,
                quarantine: day.quarantine,
                reject: day.reject,
              },
            }))}
            label={`Reported messages per day over the last ${CHART_DAYS} days, by DMARC result.`}
            series={[
              { key: "passing", label: "Passed", className: "bg-foreground/72" },
              { key: "none", label: "Failed, delivered", className: "bg-warning" },
              { key: "quarantine", label: "Failed, quarantined", className: "bg-destructive/56" },
              { key: "reject", label: "Failed, rejected", className: "bg-destructive" },
            ]}
          />
        </PanelBody>
      </Panel>

      <Panel
        description={`The sources that sent as ${domain.name} in the last ${DMARC_READINESS.windowDays} days, most messages first.`}
        title="Sources"
      >
        {summary.sources.length === 0 ? (
          <EmptyState
            compact
            description={
              dmarc.report_address
                ? `Mailbox providers send a report about each day's mail, usually within a day or two, once the DMARC record names ${dmarc.report_address}.`
                : "This deployment doesn't receive email, so it can't receive DMARC reports."
            }
            icon={FileChartColumnIcon}
            title="No reports yet"
          />
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Source IP</TableHead>
                <TableHead>From domain</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead className="text-right">Passed</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.sources.map((source) => (
                <TableRow key={`${source.source_ip} ${source.header_from} ${source.via_coss}`}>
                  <TableCell className="font-mono text-xs">{source.source_ip}</TableCell>
                  <TableCell className="font-mono text-xs">{source.header_from}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {count.format(source.messages)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <StatusDot
                      tone={
                        source.passing === source.messages
                          ? "success"
                          : source.passing === 0
                            ? "error"
                            : "warning"
                      }
                    >
                      {rate(source.passing, source.messages)}
                    </StatusDot>
                  </TableCell>
                  <TableCell className="text-right">
                    {source.via_coss ? <Badge variant="outline">coss.com</Badge> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel
        description={`Reports are kept for ${RETENTION_DAYS.dmarcReports} days.`}
        title="Reports"
      >
        {page && page.data.length > 0 ? (
          <>
            <Table variant="card">
              <TableHeader>
                <TableRow>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Messages</TableHead>
                  <TableHead className="text-right">Passed</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.data.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <Link
                        className="font-medium hover:underline"
                        href={`${listPath}/${report.id}`}
                      >
                        {report.reporter.org_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDateTime(report.period_start)} – {formatDateTime(report.period_end)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {count.format(report.messages)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rate(report.passing, report.messages)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatRelative(report.received_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PanelBody>
              <CursorPager
                newestHref={after ? listPath : undefined}
                olderHref={nextPage ?? undefined}
                summary={`${page.data.length} ${page.data.length === 1 ? "report" : "reports"}${after ? " (older)" : ""}`}
              />
            </PanelBody>
          </>
        ) : (
          <PanelBody>
            <p className="text-muted-foreground text-sm">No reports received yet.</p>
          </PanelBody>
        )}
      </Panel>
    </div>
  );
}
