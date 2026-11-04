import type { SpendBudget } from "@coss/companion";
import { Stack, useLocalSearchParams } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge } from "../../../../../components/badge";
import { BudgetMeter } from "../../../../../components/budget";
import { EmptyState } from "../../../../../components/empty";
import { Panel, Ruled } from "../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../components/screen";
import { SpendTabs } from "../../../../../components/spend-tabs";
import { Text } from "../../../../../components/text";
import { WebButton } from "../../../../../components/web-button";
import { formatMoney, roleLabel } from "../../../../../lib/format";
import { useBudgets } from "../../../../../lib/queries-spend";

// Copy from apps/web/src/app/[orgSlug]/spend/budgets/page.tsx. Read-only: budgets are set,
// changed and removed on coss.com.

export default function BudgetsScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const query = useBudgets(org);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data)
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  const budgets = query.data;
  return (
    <Screen onRefresh={() => query.refetch()} title="Spend">
      <WebButton path={`/${org}/spend/budgets`} />
      <PageIntro
        description="Monthly budgets for what members' personal API keys, projects and single API keys spend. Over a budget, its live sending pauses until next month or until the budget is raised; the billing contacts (and the member it concerns) are emailed at its alert thresholds."
        title="Spend"
      />
      <SpendTabs org={org} value="budgets" />
      <Panel
        description={
          budgets.member_default !== null
            ? `Default: ${formatMoney(budgets.member_default)} a month for each member's personal keys.`
            : "No default: members' personal keys have no limit unless you set one for them."
        }
        title="Members"
      >
        <Ruled>
          {budgets.members.map((member) => (
            <BudgetRow
              budget={member.budget}
              detail={`${member.email} · ${roleLabel(member.role)}`}
              key={member.user_id}
              label={member.name}
              paused={member.paused}
            />
          ))}
        </Ruled>
      </Panel>
      <Panel
        description="Everything sent in a project counts, whatever key (or the dashboard) sent it."
        title="Projects"
      >
        <Ruled>
          {budgets.projects.map((project) => (
            <BudgetRow
              budget={project.budget}
              key={project.id}
              label={project.name}
              paused={project.paused}
            />
          ))}
        </Ruled>
      </Panel>
      <Panel description="Budgets for single keys, organization or personal." title="API keys">
        {budgets.keys.length ? (
          <Ruled>
            {budgets.keys.map((key) => (
              <BudgetRow
                budget={key.budget}
                detail={key.detail}
                key={key.api_key_id}
                label={key.label}
                paused={key.paused}
              />
            ))}
          </Ruled>
        ) : (
          <EmptyState
            description="Cap a single key, like a staging server's or a contractor's."
            icon={KeyRound}
            title="No key budgets"
          />
        )}
      </Panel>
    </Screen>
  );
}

function BudgetRow(props: {
  label: string;
  detail?: string | null;
  budget: SpendBudget;
  paused: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.name}>
        <Text numberOfLines={1} style={styles.shrink} variant="label">
          {props.label}
        </Text>
        {props.paused ? <Badge variant="error">Paused</Badge> : null}
      </View>
      {props.detail ? (
        <Text muted numberOfLines={2} variant="small">
          {props.detail}
        </Text>
      ) : null}
      <View style={styles.budget}>
        <BudgetMeter budget={props.budget} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, padding: 16 },
  name: { flexDirection: "row", alignItems: "center", gap: 8 },
  shrink: { flexShrink: 1 },
  budget: { marginTop: 6 },
});
