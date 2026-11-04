import type {
  MemberSpendResponse,
  OrganizationSpendResponse,
  SpendDay,
  SpendGroup,
  SpendRow,
} from "@coss/companion";
import { router, useLocalSearchParams } from "expo-router";
import { Wallet } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { type BarSeries, StackedBars } from "../../../../../components/activity-chart";
import { Alert } from "../../../../../components/alert";
import { Badge } from "../../../../../components/badge";
import { BudgetMeter } from "../../../../../components/budget";
import { EmptyState } from "../../../../../components/empty";
import { type Filter, FilterChips } from "../../../../../components/filters";
import { Panel, PanelBody, Ruled } from "../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../components/screen";
import { SpendTabs } from "../../../../../components/spend-tabs";
import { Stat, StatGrid } from "../../../../../components/stat";
import { Text } from "../../../../../components/text";
import { WebButton } from "../../../../../components/web-button";
import { formatCount, formatMoney, formatPeriod } from "../../../../../lib/format";
import { useSpend } from "../../../../../lib/queries-spend";
import { space } from "../../../../../lib/theme";

// Copy from apps/web/src/app/[orgSlug]/spend/page.tsx. Read-only: budgets are set on coss.com.

const GROUPS: (Filter<SpendGroup> & { value: SpendGroup })[] = [
  { value: "member", label: "Members" },
  { value: "project", label: "Projects" },
  { value: "environment", label: "Environments" },
  { value: "key", label: "API keys" },
];

const ORGANIZATION_SERIES: BarSeries<SpendDay>[] = [
  {
    key: "organization",
    label: "Organization",
    color: "chartSent",
    value: (day) => day.organization,
  },
  { key: "personal", label: "Personal keys", color: "chartLight", value: (day) => day.personal },
];

const MEMBER_SERIES: BarSeries<SpendDay>[] = [
  { key: "mine", label: "Your personal keys", color: "chartSent", value: (day) => day.personal },
];

export default function SpendScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const query = useSpend(org);
  if (query.isPending) return <Screen title="Spend" loading="list" />;
  if (query.isError && !query.data)
    return <Screen title="Spend" error={query.error} onRetry={() => query.refetch()} />;
  const spend = query.data;
  return (
    <Screen onRefresh={() => query.refetch()} title="Spend">
      <WebButton path={`/${org}/spend`} />
      {spend.view === "member" ? (
        <MemberSpend spend={spend} />
      ) : (
        <OrganizationSpend org={org} spend={spend} />
      )}
    </Screen>
  );
}

function OrganizationSpend({ org, spend }: { org: string; spend: OrganizationSpendResponse }) {
  const [by, setBy] = useState<SpendGroup>("member");
  const rows = spend.breakdown[by];
  const openBudgets = () => router.replace({ pathname: "/[org]/spend/budgets", params: { org } });
  return (
    <>
      <PageIntro
        description={`Live usage charges this month (${formatPeriod(spend.period)}) by who caused them: projects, environments, API keys and the members whose personal keys sent it. Your plan's credit pays for spend, it doesn't reduce it.`}
        title="Spend"
      />
      <SpendTabs org={org} value="overview" />
      {spend.paused.length ? (
        <Alert
          action={{ label: "Budgets", onPress: openBudgets }}
          description={`Live sending is paused for ${spend.paused.join(", ")} until next month or until a higher budget is set.`}
          title={
            spend.paused.length === 1
              ? "1 budget is used up"
              : `${spend.paused.length} budgets are used up`
          }
          tone="warning"
        />
      ) : null}
      <StatGrid>
        <Stat detail="Usage charges so far" label="This month" value={formatMoney(spend.total)} />
        <Stat
          detail="Org keys and the dashboard"
          label="Organization"
          value={formatMoney(spend.organization)}
        />
        <Stat
          detail="Members' personal API keys"
          label="Personal keys"
          value={formatMoney(spend.personal)}
        />
        <Stat
          detail={spend.spend_limit === null ? "Not set" : "Beyond your plan's credit"}
          label="Spend limit"
          value={spend.spend_limit === null ? "None" : formatMoney(spend.spend_limit)}
        />
      </StatGrid>
      <Panel title="Spend per day">
        <PanelBody>
          <StackedBars
            days={spend.days}
            describe={formatMoney}
            format={formatMoney}
            series={ORGANIZATION_SERIES}
          />
        </PanelBody>
      </Panel>
      <FilterChips
        items={GROUPS}
        onChange={(value) => {
          if (value) setBy(value);
        }}
        value={by}
      />
      <Panel title="Breakdown">
        {rows.length ? (
          <Ruled>
            {rows.map((row) => (
              <SpendRowView key={row.id || "none"} row={row} />
            ))}
          </Ruled>
        ) : (
          <EmptyState
            description="Live emails show up here as they're sent. Sandbox usage is never billed."
            icon={Wallet}
            title="No spend yet this month"
          />
        )}
      </Panel>
    </>
  );
}

function MemberSpend({ spend }: { spend: MemberSpendResponse }) {
  const { budget } = spend;
  return (
    <>
      <PageIntro
        description={`What your personal API keys sent this month (${formatPeriod(spend.period)}), at the organization's prices. Organization keys aren't yours to pay for.`}
        title="Your spend"
      />
      <StatGrid>
        <Stat detail="Usage charges so far" label="This month" value={formatMoney(spend.total)} />
        <Stat
          detail={
            budget.from_default
              ? "The organization's default"
              : budget.applies
                ? "Set for you"
                : "Ask an owner to set one"
          }
          label="Budget"
          value={budget.amount === null ? "None" : formatMoney(budget.amount)}
        />
        <Stat
          detail={spend.over_budget ? "Over budget" : "Left this month"}
          label="Remaining"
          value={spend.remaining === null ? "—" : formatMoney(spend.remaining)}
        />
      </StatGrid>
      <Panel title="Spend per day">
        <PanelBody>
          <StackedBars
            days={spend.days}
            describe={formatMoney}
            format={formatMoney}
            series={MEMBER_SERIES}
          />
        </PanelBody>
      </Panel>
      <Panel title="By key">
        {spend.keys.length ? (
          <Ruled>
            {spend.keys.map((row) => (
              <SpendRowView key={row.id || "none"} row={row} />
            ))}
          </Ruled>
        ) : (
          <EmptyState
            description="Create a personal key in an environment open to them (or run coss login). Sandbox usage is never billed."
            icon={Wallet}
            title="Your personal keys haven't sent live email this month"
          />
        )}
      </Panel>
    </>
  );
}

/** A breakdown row: who, what they spent and its share, and the budget it's held to. */
function SpendRowView({ row }: { row: SpendRow }) {
  return (
    <View style={styles.row}>
      <View style={styles.line}>
        <View style={styles.name}>
          <Text numberOfLines={1} style={styles.shrink} variant="label">
            {row.label}
          </Text>
          {row.paused ? <Badge variant="error">Paused</Badge> : null}
        </View>
        <Text variant="mono">{formatMoney(row.spent)}</Text>
      </View>
      {row.detail ? (
        <Text muted numberOfLines={2} variant="small">
          {row.detail}
        </Text>
      ) : null}
      <Text muted variant="mono">
        {formatCount(row.email_recipients)} email recipients
        {row.share === null ? "" : ` · ${row.share.toFixed(1)}%`}
      </Text>
      {row.budget ? (
        <View style={styles.budget}>
          <BudgetMeter budget={row.budget} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.xs, padding: space.lg },
  line: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm },
  shrink: { flexShrink: 1 },
  budget: { marginTop: 6 },
});
