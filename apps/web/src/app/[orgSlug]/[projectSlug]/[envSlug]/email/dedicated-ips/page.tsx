import { ADD_ONS, PLANS } from "@coss/billing";
import { dedicatedIpPoolObject, READY_MIN_DELIVERIES } from "@coss/email";
import { Alert, AlertDescription } from "@coss/ui/components/alert";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { NetworkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { Stat, StatRow } from "@/components/stat-row";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { formatCents, formatDate } from "@/lib/billing-format";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "Dedicated IPs" };

const STATUS: Record<string, { tone: StatusTone; label: string; detail: string }> = {
  waiting: {
    tone: "warning",
    label: "Waiting",
    detail: "Every dedicated IP pool is taken right now. COSS support has been told.",
  },
  provisioning: {
    tone: "info",
    label: "Setting up",
    detail: "Your pool is being created. Live emails keep going out from shared IPs meanwhile.",
  },
  warming: {
    tone: "info",
    label: "Warming up",
    detail:
      "Live emails go through your pool. Its IPs are warmed up per mailbox provider: what they can't take yet leaves from shared IPs, so nothing is held back.",
  },
  ready: {
    tone: "success",
    label: "Ready",
    detail: "Your live emails leave from your dedicated IPs.",
  },
  releasing: {
    tone: "neutral",
    label: "Ending",
    detail:
      "The add-on ended: live emails are back on shared IPs, and the pool is released a day later.",
  },
};

export default async function DedicatedIpsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/dedicated-ips">) {
  const { orgSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ domain: ["read"] })) notFound();
  const pool = await dedicatedIpPoolObject(organization.id);
  const addOn = ADD_ONS.dedicated_ips;
  const billingHref = `/${organization.slug}/settings/billing`;
  const status = STATUS[pool.status];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Your own sending IPs, so no other sender's reputation affects yours. SES leases, scales and warms them up automatically."
        meta={status ? <StatusDot tone={status.tone}>{status.label}</StatusDot> : null}
        title="Dedicated IPs"
      />

      {pool.status === "not_enabled" ? (
        <Panel>
          <PanelBody flush>
            <EmptyState
              action={
                can({ billing: ["read"] }) ? (
                  <Button render={<Link href={billingHref} />} size="sm">
                    Add on the billing page
                  </Button>
                ) : null
              }
              description={`${formatCents(addOn.unitAmountCents)} per month on the ${addOn.plans
                .map((plan) => PLANS[plan].name)
                .join(
                  " and ",
                )} plans, plus usage for email sent through them. Best for steady volume: the first IP is assigned once you send a few hundred emails a day.`}
              icon={NetworkIcon}
              title="Dedicated IPs aren't on your plan"
            />
          </PanelBody>
        </Panel>
      ) : (
        <>
          {status ? (
            <Alert variant={pool.status === "waiting" ? "warning" : "info"}>
              <AlertDescription>
                {status.detail}
                {pool.message ? ` ${pool.message}` : ""}
              </AlertDescription>
            </Alert>
          ) : null}
          <StatRow>
            <Stat label="IPs" value={pool.ips.length} />
            <Stat
              detail={
                pool.dedicated_share === null
                  ? `shown from ${READY_MIN_DELIVERIES.toLocaleString("en-US")} deliveries`
                  : "of deliveries, last 7 days"
              }
              label="From your IPs"
              value={
                pool.dedicated_share === null ? "—" : `${Math.round(pool.dedicated_share * 100)}%`
              }
            />
            <Stat
              label="Delivered, last 7 days"
              value={pool.ips
                .reduce((total, ip) => total + ip.delivered_7d, 0)
                .toLocaleString("en-US")}
            />
            <Stat
              label="Ready since"
              value={<span className="text-xl">{formatDate(pool.ready_at)}</span>}
            />
          </StatRow>
          <Panel
            description="SES adds IPs as your volume grows and removes them when it drops. Only live emails use them."
            title="IP addresses"
          >
            {pool.ips.length ? (
              <Table variant="card">
                <TableHeader>
                  <TableRow>
                    <TableHead>IP</TableHead>
                    <TableHead className="text-right">Delivered, last 7 days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pool.ips.map((ip) => (
                    <TableRow key={ip.ip}>
                      <TableCell className="font-mono text-xs">{ip.ip}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {ip.delivered_7d.toLocaleString("en-US")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <PanelBody flush>
                <EmptyState
                  compact
                  description="SES assigns the first IP once you send a few hundred emails a day over a few days. Until then, emails leave from shared IPs."
                  icon={NetworkIcon}
                  title="No IPs yet"
                />
              </PanelBody>
            )}
          </Panel>
          <p className="text-muted-foreground text-sm">
            Keeping a dedicated IP's reputation is up to its sender: watch bounces and complaints on
            the Reputation page. Manage the add-on on the{" "}
            <Link className="underline" href={billingHref}>
              billing page
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
