import { listRiskLimitBuckets } from "@coss/risk";
import { getEnvironment } from "@coss/tenancy";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { GaugeIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { requireOrgMember } from "@/lib/session";
import { BucketDialog, DeleteBucketButton } from "./bucket-dialog";

export const metadata: Metadata = { title: "Rate limits" };

const PERIOD_TEXT: Record<number, string> = {
  1: "second",
  60: "minute",
  3600: "hour",
  86400: "day",
};

function rate(limit: number, periodSeconds: number): string {
  const unit = PERIOD_TEXT[periodSeconds];
  return unit
    ? `${limit.toLocaleString()} per ${unit}`
    : `${limit.toLocaleString()} per ${periodSeconds} s`;
}

export default async function RiskLimitsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/risk/limits">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ risk: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const buckets = await listRiskLimitBuckets({
    organizationId: organization.id,
    environmentId: environment.id,
  });
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
  };
  const canUpdate = can({ risk: ["update"] });
  const create = canUpdate ? <BucketDialog {...target} /> : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={create}
        description="Your own rate limits: coss.risk.limit({ bucket, key }) takes a token from that key's share of a bucket and says whether to let the request through."
        meta={<ModeBadge mode={environment.mode} />}
        title="Rate limits"
      />

      <Panel>
        {buckets.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={create}
              compact
              description="Limit password resets per address, sign-ups per IP, or anything else per key."
              icon={GaugeIcon}
              title="No buckets yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Bucket</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Burst</TableHead>
                <TableHead>While coss.com can't count</TableHead>
                {canUpdate ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.data.map((bucket) => (
                <TableRow key={bucket.id}>
                  <TableCell className="font-medium font-mono text-[0.8125rem]">
                    {bucket.name}
                  </TableCell>
                  <TableCell>{rate(bucket.limit, bucket.period_seconds)}</TableCell>
                  <TableCell className="tabular-nums">{bucket.burst.toLocaleString()}</TableCell>
                  <TableCell>
                    <StatusDot tone={bucket.on_failure === "allow" ? "neutral" : "warning"}>
                      {bucket.on_failure === "allow" ? "Allow" : "Deny"}
                    </StatusDot>
                  </TableCell>
                  {canUpdate ? (
                    <TableCell>
                      <span className="flex gap-2">
                        <BucketDialog {...target} bucket={bucket} />
                        <DeleteBucketButton {...target} bucketId={bucket.id} name={bucket.name} />
                      </span>
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
