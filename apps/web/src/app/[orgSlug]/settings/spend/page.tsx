import { getBillingAccount, type SpendLine } from "@coss/billing";
import { settingsHref } from "@coss/dashboard-routes";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
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
import { WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BudgetCell } from "@/components/billing/budget-cell";
import { StackedBars } from "@/components/charts/stacked-bars";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks } from "@/components/filter-links";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { Stat, StatRow } from "@/components/stat-row";
import { SubNav } from "@/components/sub-nav";
import { formatCents, formatDate, formatPeriodRange, formatQuantity } from "@/lib/billing-format";
import { requireOrgMember } from "@/lib/session";
import {
  dailySpend,
  environmentLabel,
  keyLabel,
  ownSpend,
  pausedStatuses,
  SPEND_GROUP_SCOPE,
  type SpendNames,
  spendOverview,
  spendRows,
  spendShare,
  targetLabel,
} from "@/lib/spend";

export const metadata: Metadata = { title: "Spend" };

const GROUPS = [
  { value: "member", label: "Members", column: "Member" },
  { value: "project", label: "Projects", column: "Project" },
  { value: "environment", label: "Environments", column: "Environment" },
  { value: "key", label: "API keys", column: "API key" },
] as const;
type Group = (typeof GROUPS)[number]["value"];

function isGroup(value: unknown): value is Group {
  return GROUPS.some((group) => group.value === value);
}

/** Each UTC day of the month so far, with `seriesOf` its lines' cents. */
function dailyColumns(
  period: { start: Date; end: Date },
  now: Date,
  lines: readonly SpendLine[],
  seriesOf: (line: SpendLine) => string,
) {
  return dailySpend(period, now, lines, seriesOf).map(({ day, values }) => ({
    label: formatDate(day),
    values,
  }));
}

export default async function SpendPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/settings/spend">) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const { session, organization, can } = await requireOrgMember(orgSlug);
  const now = new Date();
  const overview = await spendOverview(organization.id, now);
  const { spend, names } = overview;
  const base = settingsHref(organization.slug, "/spend");
  const period = formatPeriodRange(spend.period.start, spend.period.end);

  if (!can({ billing: ["read"] })) {
    return (
      <MySpend base={base} names={names} now={now} overview={overview} userId={session.user.id} />
    );
  }

  const account = await getBillingAccount(organization.id);
  const by: Group = isGroup(query.by) ? query.by : "member";
  const personalCents = spend.lines
    .filter((line) => line.userId !== "")
    .reduce((total, line) => total + line.cents, 0n);
  const paused = pausedStatuses(overview);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Button
            render={<Link href={`/${organization.slug}/settings/billing`} />}
            variant="outline"
          >
            Billing
          </Button>
        }
        description={`Live usage charges this month (${period}) by who caused them: projects, environments, API keys and the members whose personal keys sent it. Your plan's credit pays for spend, it doesn't reduce it.`}
        title="Spend"
      />
      <SubNav base={base} className="border-b" nav="spend" />

      {paused.length ? (
        <Alert variant="warning">
          <AlertTitle>
            {paused.length === 1 ? "1 budget is used up" : `${paused.length} budgets are used up`}
          </AlertTitle>
          <AlertDescription>
            Live sending is paused for{" "}
            {paused.map((status) => targetLabel(names, status)).join(", ")} until next month or
            until a higher budget is set.{" "}
            <Link className="underline" href={`${base}/budgets`}>
              Budgets
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <StatRow>
        <Stat
          detail="Usage charges so far"
          label="This month"
          value={formatCents(spend.totalCents)}
        />
        <Stat
          detail="Org keys and the dashboard"
          label="Organization"
          value={formatCents(spend.totalCents - personalCents)}
        />
        <Stat
          detail="Members' personal API keys"
          label="Personal keys"
          value={formatCents(personalCents)}
        />
        <Stat
          detail={
            account?.spendLimitCents === null || account?.spendLimitCents === undefined
              ? "Not set"
              : "Beyond your plan's credit"
          }
          href={`/${organization.slug}/settings/billing#spend-controls`}
          label="Spend limit"
          value={
            account?.spendLimitCents === null || account?.spendLimitCents === undefined
              ? "None"
              : formatCents(account.spendLimitCents)
          }
        />
      </StatRow>

      <Panel title="Spend per day">
        <PanelBody>
          <StackedBars
            columns={dailyColumns(spend.period, now, spend.lines, (line) =>
              line.userId ? "personal" : "organization",
            )}
            label="Spend per day this month, organization and personal keys"
            series={[
              { key: "organization", label: "Organization", className: "bg-foreground/72" },
              { key: "personal", label: "Personal keys", className: "bg-foreground/32" },
            ]}
            unit="cents"
          />
        </PanelBody>
      </Panel>

      <Panel
        action={
          <FilterLinks
            options={GROUPS.map((group) => ({
              value: group.value,
              label: group.label,
              href: `${base}?by=${group.value}`,
            }))}
            value={by}
          />
        }
        title="Breakdown"
      >
        <Breakdown by={by} names={names} overview={overview} />
      </Panel>
    </div>
  );
}

function Breakdown(props: {
  by: Group;
  names: SpendNames;
  overview: Awaited<ReturnType<typeof spendOverview>>;
}) {
  const { spend } = props.overview;
  const scope = SPEND_GROUP_SCOPE[props.by];
  const rows = spendRows(props.overview, props.by);

  if (!rows.length) {
    return (
      <PanelBody flush>
        <EmptyState
          compact
          description="Live emails show up here as they're sent. Sandbox usage is never billed."
          icon={WalletIcon}
          title="No spend yet this month"
        />
      </PanelBody>
    );
  }
  return (
    <Table variant="card">
      <TableHeader>
        <TableRow>
          <TableHead>{GROUPS.find((group) => group.value === props.by)?.column}</TableHead>
          <TableHead className="text-right">Email recipients</TableHead>
          <TableHead className="text-right">Spend</TableHead>
          <TableHead className="text-right">Share</TableHead>
          {scope ? <TableHead className="w-48">Budget</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key || "none"}>
            <TableCell>
              <div className="flex flex-col">
                <span className="flex items-center gap-2 font-medium">
                  {row.label}
                  {row.paused ? <Badge variant="error">Paused</Badge> : null}
                </span>
                {row.detail ? (
                  <span className="text-muted-foreground text-xs">{row.detail}</span>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {formatQuantity(row.recipients)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {formatCents(row.cents)}
            </TableCell>
            <TableCell className="text-right font-mono text-muted-foreground text-xs tabular-nums">
              {share(row.cents, spend.totalCents)}
            </TableCell>
            {scope ? (
              <TableCell>{row.key ? <BudgetCell status={row.status} /> : null}</TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function share(part: bigint, total: bigint): string {
  const percent = spendShare(part, total);
  return percent === null ? "—" : `${percent.toFixed(1)}%`;
}

/** A member's own spend: what their personal keys sent this month, against their budget. */
function MySpend(props: {
  base: string;
  overview: Awaited<ReturnType<typeof spendOverview>>;
  names: SpendNames;
  userId: string;
  now: Date;
}) {
  const { spend } = props.overview;
  // A pause shows in the organization's banner (layout).
  const { lines: mine, total, status, byKey, remaining } = ownSpend(props.overview, props.userId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description={`What your personal API keys sent this month (${formatPeriodRange(spend.period.start, spend.period.end)}), at the organization's prices. Organization keys aren't yours to pay for.`}
        title="Your spend"
      />
      <StatRow className="lg:grid-cols-3">
        <Stat detail="Usage charges so far" label="This month" value={formatCents(total)} />
        <Stat
          detail={
            status?.fromDefault
              ? "The organization's default"
              : status?.budget
                ? "Set for you"
                : "Ask an owner to set one"
          }
          label="Budget"
          value={status?.amountCents === null || !status ? "None" : formatCents(status.amountCents)}
        />
        <Stat
          detail={remaining !== null && remaining < 0n ? "Over budget" : "Left this month"}
          label="Remaining"
          value={remaining === null ? "—" : formatCents(remaining > 0n ? remaining : 0n)}
        />
      </StatRow>
      <Panel title="Spend per day">
        <PanelBody>
          <StackedBars
            columns={dailyColumns(spend.period, props.now, mine, () => "mine")}
            label="Your spend per day this month"
            series={[{ key: "mine", label: "Your personal keys", className: "bg-foreground/72" }]}
            unit="cents"
          />
        </PanelBody>
      </Panel>
      <Panel title="By key">
        {byKey.length ? (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead className="text-right">Email recipients</TableHead>
                <TableHead className="text-right">Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byKey.map(([key, totalOf]) => {
                const found = props.names.keys.get(key);
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{keyLabel(props.names, key)}</span>
                        {found ? (
                          <span className="text-muted-foreground text-xs">
                            {environmentLabel(props.names, found.environmentId)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatQuantity(totalOf.quantities["email.recipients"] ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatCents(totalOf.cents)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <PanelBody flush>
            <EmptyState
              compact
              description="Create a personal key in an environment open to them (or run coss login). Sandbox usage is never billed."
              icon={WalletIcon}
              title="Your personal keys haven't sent live email this month"
            />
          </PanelBody>
        )}
      </Panel>
    </div>
  );
}
