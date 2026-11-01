import { getDmarcReport, getDomain } from "@coss/email";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "DMARC report" };

const count = new Intl.NumberFormat("en");

function Result({ value }: { value: "pass" | "fail" }) {
  return <StatusDot tone={value === "pass" ? "success" : "error"}>{value}</StatusDot>;
}

export default async function DmarcReportPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/domains/[domainId]/dmarc/[reportId]">) {
  const { orgSlug, domainId, reportId } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ domain: ["read"] })) notFound();
  const domain = await getDomain({ organizationId: organization.id, id: domainId });
  if (!domain) notFound();
  const report = await getDmarcReport({
    organizationId: organization.id,
    domainId: domain.id,
    id: reportId,
  });
  if (!report) notFound();
  const policy = report.policy_published;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description={`What ${report.reporter.org_name} saw of mail claiming to be from ${domain.name} between ${formatDateTime(report.period_start)} and ${formatDateTime(report.period_end)}.`}
        meta={
          report.truncated ? <Badge variant="warning">Truncated to 10,000 rows</Badge> : undefined
        }
        title={`Report from ${report.reporter.org_name}`}
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title={`${report.records.length} rows`}>
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Source IP</TableHead>
                <TableHead>From / envelope</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead>DKIM</TableHead>
                <TableHead>SPF</TableHead>
                <TableHead>Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.records.map((record, index) => (
                // Rows have no id of their own; their position is stable.
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are ordered as reported
                <TableRow key={index}>
                  <TableCell className="align-top font-mono text-xs">
                    <div className="flex flex-col gap-1">
                      {record.source_ip}
                      {record.via_coss ? (
                        <Badge className="w-fit" variant="outline">
                          coss.com
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal align-top font-mono text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span>{record.header_from}</span>
                      {record.envelope_from ? (
                        <span className="text-muted-foreground">{record.envelope_from}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums">
                    {count.format(record.count)}
                  </TableCell>
                  <TableCell className="align-top">
                    <Result value={record.dkim} />
                  </TableCell>
                  <TableCell className="align-top">
                    <Result value={record.spf} />
                  </TableCell>
                  <TableCell className="whitespace-normal align-top text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span>{record.disposition}</span>
                      {record.reasons.map((reason) => (
                        <span className="text-muted-foreground" key={reason.type}>
                          {reason.type}
                          {reason.comment ? `: ${reason.comment}` : ""}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel title="Details">
          <PanelBody flush>
            <SpecList>
              <SpecItem label="Reporter">{report.reporter.org_name}</SpecItem>
              {report.reporter.email ? (
                <SpecItem label="Contact" mono>
                  <span className="truncate">{report.reporter.email}</span>
                </SpecItem>
              ) : null}
              <SpecItem label="Report ID" mono>
                <span className="truncate">{report.report_id}</span>
              </SpecItem>
              <SpecItem label="Messages">{count.format(report.messages)}</SpecItem>
              <SpecItem label="Passed DMARC">{count.format(report.passing)}</SpecItem>
              <SpecItem label="Policy seen" mono>
                p={policy.p ?? "none"}
                {policy.sp ? ` sp=${policy.sp}` : ""}
                {policy.pct !== null && policy.pct < 100 ? ` pct=${policy.pct}` : ""}
              </SpecItem>
              <SpecItem label="Received">{formatDateTime(report.received_at)}</SpecItem>
            </SpecList>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
