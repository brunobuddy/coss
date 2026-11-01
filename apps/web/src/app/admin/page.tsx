import { platformUsageByDay } from "@coss/billing";
import { dedicatedIpCapacity } from "@coss/email";
import { platformEmailStats } from "@coss/email/admin";
import { listOrganizationStandings } from "@coss/reputation";
import { countScreeningsForAdmin } from "@coss/screening";
import { getAdminOverview, listAdminAuditEvents } from "@coss/tenancy/admin";
import { Button } from "@coss/ui/components/button";
import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import { StackedBars } from "@/components/charts/stacked-bars";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SectionHeader } from "@/components/section-header";
import { Stat, StatRow } from "@/components/stat-row";
import { systemOrganizationId } from "@/lib/billing";
import { formatCompact } from "@/lib/format";
import { requirePlatformAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Admin" };

const DAY_MS = 86_400_000;
const CHART_DAYS = 30;

const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function AdminOverviewPage() {
  await requirePlatformAdmin();
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const chartStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (CHART_DAYS - 1) * DAY_MS,
  );
  const systemOrganization = await systemOrganizationId();
  const stats = (since: Date) =>
    platformEmailStats({ since, now, systemOrganizationId: systemOrganization });
  const [
    overview,
    { events },
    day,
    week,
    month,
    usage,
    screenings,
    warned,
    sendingSuspended,
    pools,
  ] = await Promise.all([
    getAdminOverview(now),
    listAdminAuditEvents({ limit: 10 }),
    stats(ago(1)),
    stats(ago(7)),
    stats(ago(30)),
    platformUsageByDay({
      meter: "email.recipients",
      interval: { start: chartStart, end: now },
      apartFrom: systemOrganization,
    }),
    countScreeningsForAdmin({ since: ago(7), now }),
    listOrganizationStandings({ status: "warning", limit: 200 }),
    listOrganizationStandings({ status: "suspended", limit: 200 }),
    dedicatedIpCapacity(),
  ]);

  const columns = Array.from({ length: CHART_DAYS }, (_, index) => {
    const start = new Date(chartStart.getTime() + index * DAY_MS);
    const values: Record<string, number> = { customers: 0, coss: 0 };
    for (const row of usage) {
      if (row.day.getTime() === start.getTime()) {
        values[row.apart ? "coss" : "customers"] = row.quantity;
      }
    }
    return { label: dayLabel.format(start), values };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="What the platform is sending, who signs up, and every admin action."
        title="Overview"
      />

      <SectionHeader
        description={
          systemOrganization
            ? "Live emails of customers. coss.com's own account and notification emails are counted apart."
            : "Live emails. NOTIFICATIONS_ENVIRONMENT_ID isn't set, so coss.com's own emails are counted as a customer's."
        }
        title="Customer sending"
      />
      <StatRow>
        <Stat
          detail={`coss.com: ${formatCompact(day.coss.live.sent)}`}
          href="/admin/sending?window=24h"
          label="Sent · 24 h"
          value={formatCompact(day.customers.live.sent)}
        />
        <Stat
          detail={`coss.com: ${formatCompact(week.coss.live.sent)}`}
          href="/admin/sending?window=7d"
          label="Sent · 7 days"
          value={formatCompact(week.customers.live.sent)}
        />
        <Stat
          detail={`coss.com: ${formatCompact(month.coss.live.sent)}`}
          href="/admin/sending?window=30d"
          label="Sent · 30 days"
          value={formatCompact(month.customers.live.sent)}
        />
        <Stat
          detail={`24 h: ${formatCompact(day.customers.liveSenders)} · 30 days: ${formatCompact(month.customers.liveSenders)}`}
          href="/admin/sending?window=7d"
          label="Sending organizations · 7 days"
          value={formatCompact(week.customers.liveSenders)}
        />
      </StatRow>
      <Panel
        description="Live recipients sent per UTC day (metered usage), the last 30 days."
        title="Live recipients"
      >
        <PanelBody>
          <StackedBars
            columns={columns}
            label="Live recipients sent per day, customers and coss.com"
            series={[
              { key: "customers", label: "Customers", className: "bg-foreground/72" },
              { key: "coss", label: "coss.com", className: "bg-foreground/24" },
            ]}
          />
        </PanelBody>
      </Panel>

      <SectionHeader description="The last 7 days, customers only." title="Needs attention" />
      <StatRow>
        <Stat
          detail={`${formatCompact(week.customers.live.queued + week.customers.live.scheduled)} queued or scheduled`}
          href="/admin/emails?status=failed"
          label="Failed live emails"
          value={formatCompact(week.customers.live.failed)}
        />
        <Stat
          detail="Never delivered"
          href="/admin/emails?mode=sandbox"
          label="Sandbox emails"
          value={formatCompact(week.customers.sandbox)}
        />
        <Stat
          detail={`${formatCompact(screenings.blocked)} blocked · ${formatCompact(screenings.error)} errors`}
          href="/admin/screening"
          label="Flagged by screening"
          value={formatCompact(screenings.flagged)}
        />
        <Stat
          detail={`${formatCompact(sendingSuspended.length)} live sending suspended`}
          href="/admin/reputation?status=warning"
          label="Reputation warnings"
          value={formatCompact(warned.length)}
        />
      </StatRow>

      <SectionHeader title="Accounts" />
      <StatRow className="lg:grid-cols-5">
        <Stat
          detail={`24 h: ${formatCompact(overview.newUsersDay)} · total ${formatCompact(overview.users)}`}
          href="/admin/signups"
          label="Sign-ups · 7 days"
          value={formatCompact(overview.newUsersWeek)}
        />
        <Stat
          detail={`total ${formatCompact(overview.organizations)}`}
          href="/admin/organizations"
          label="New organizations · 7 days"
          value={formatCompact(overview.newOrganizationsWeek)}
        />
        <Stat
          detail={`${formatCompact(overview.admins)} platform admins`}
          href="/admin/users?status=banned"
          label="Banned users"
          value={formatCompact(overview.bannedUsers)}
        />
        <Stat
          href="/admin/organizations?status=suspended"
          label="Accounts suspended"
          value={formatCompact(overview.suspendedOrganizations)}
        />
        <Stat
          className="max-lg:col-span-2"
          detail={pools.waiting ? `${pools.waiting} waiting` : "SES allows 50 per region"}
          label="Dedicated IP pools"
          value={`${pools.used} / ${pools.capacity}`}
        />
      </StatRow>

      <Panel
        action={
          <Button render={<Link href="/admin/audit" />} size="sm" variant="ghost">
            Full audit log
            <ArrowRightIcon />
          </Button>
        }
        title="Recent admin actions"
      >
        <AuditLogTable events={events} />
      </Panel>
    </div>
  );
}
