import { useLocalSearchParams } from "expo-router";
import { Gauge, Receipt } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../../../../../components/alert";
import { Badge, StatusDot } from "../../../../../../components/badge";
import { EmptyState } from "../../../../../../components/empty";
import { ListRow, Panel, Ruled, SpecItem, SpecList } from "../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../components/screen";
import { Stat, StatGrid } from "../../../../../../components/stat";
import { Text } from "../../../../../../components/text";
import { formatCount, formatMoney, formatPeriod, plural } from "../../../../../../lib/format";
import { useBilling } from "../../../../../../lib/queries";
import { invoiceStatus } from "../../../../../../lib/status";
import { colors, space } from "../../../../../../lib/theme";

// apps/web/src/components/billing/billing-banner.tsx, without its calls to action: the app's billing
// is read-only, with no way to pay or buy (App Store guideline 3.1.1).
const HOLDS: Record<string, string> = {
  delinquent: "An invoice is overdue. Sending resumes as soon as it is paid.",
  spend_limit: "This month's usage reached your spend limit. Sending resumes next month.",
  admin: "coss.com paused live sending for billing reasons. Contact support.",
};

function daysLeft(end: string): number {
  return Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000));
}

export default function BillingScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const query = useBilling(org);
  if (query.isPending) return <Screen title="Billing" loading="list" />;
  if (query.isError && !query.data) {
    return <Screen title="Billing" error={query.error} onRetry={() => query.refetch()} />;
  }
  const billing = query.data;
  const held =
    billing.holds.find((hold) => hold.reason === "delinquent") ??
    billing.holds.find((hold) => hold.reason === "spend_limit") ??
    billing.holds[0];
  return (
    <Screen onRefresh={() => query.refetch()} title="Billing">
      <PageIntro
        description="Your plan, usage, invoices, payment method and spend controls."
        title="Billing"
      />
      {held ? (
        <Alert
          description={`${HOLDS[held.reason] ?? HOLDS.admin} Sandbox keys still work.`}
          title="Live sending is paused"
          tone="error"
        />
      ) : billing.status === "past_due" ? (
        <Alert description="An invoice is past due." tone="warning" />
      ) : null}
      <StatGrid>
        <Stat label="Plan" value={billing.plan_name} />
        <Stat
          detail={`${plural(daysLeft(billing.period.end), "day")} left`}
          label="Usage this month"
          value={formatMoney(billing.estimate.usage)}
        />
        <Stat label="Paid by credit" value={formatMoney(billing.estimate.credit)} />
        <Stat label="Estimated total" value={formatMoney(billing.estimate.total)} />
      </StatGrid>
      <Panel description={formatPeriod(billing.period)} title="Usage this month">
        {billing.usage.length === 0 ? (
          <EmptyState
            description="Live emails and other metered usage show up here as they happen."
            icon={Gauge}
            title="No usage yet this month"
          />
        ) : (
          <Ruled>
            {billing.usage.map((line) => {
              const share = line.included ? Math.min(1, line.quantity / line.included) : null;
              return (
                <View key={line.meter} style={styles.meter}>
                  <View style={styles.meterHead}>
                    <Text style={styles.meterLabel} variant="label">
                      {line.label}
                    </Text>
                    <Text muted variant="mono">
                      {formatCount(line.quantity)}
                      {line.included ? ` of ${formatCount(line.included)}` : ""} {line.units}
                    </Text>
                  </View>
                  {share !== null ? (
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fill,
                          {
                            width: `${share * 100}%`,
                            backgroundColor: share >= 0.8 ? colors.warning : colors.success,
                          },
                        ]}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Ruled>
        )}
      </Panel>
      <Panel title="Payment and limits">
        <SpecList>
          <SpecItem label="Payment method">
            {billing.payment_method
              ? [
                  billing.payment_method.brand ?? billing.payment_method.type,
                  billing.payment_method.last4 && `•••• ${billing.payment_method.last4}`,
                ]
                  .filter(Boolean)
                  .join(" ")
              : "None"}
          </SpecItem>
          <SpecItem label="Credit remaining" mono>
            {formatMoney(billing.credit_remaining)}
          </SpecItem>
          <SpecItem label="Spend limit" mono>
            {billing.spend_limit === null ? "None" : formatMoney(billing.spend_limit)}
          </SpecItem>
        </SpecList>
      </Panel>
      <Panel title="Invoices">
        {billing.invoices.length === 0 ? (
          <EmptyState
            description="Each month's invoice appears here once the month closes."
            icon={Receipt}
            title="No invoices yet"
          />
        ) : (
          <Ruled>
            {billing.invoices.map((invoice) => {
              const [tone, label] = invoiceStatus(invoice);
              return (
                <ListRow
                  detail={formatMoney(invoice.total)}
                  href={{
                    pathname: "/[org]/settings/billing/invoices/[invoiceId]",
                    params: { org, invoiceId: invoice.id },
                  }}
                  key={invoice.id}
                  subtitle={invoice.period ? formatPeriod(invoice.period) : undefined}
                  title={invoice.number ?? invoice.id}
                  trailing={
                    <Badge variant="outline">
                      <StatusDot label={label} tone={tone} />
                    </Badge>
                  }
                />
              );
            })}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meter: { gap: space.sm, padding: space.lg },
  meterHead: { flexDirection: "row", alignItems: "baseline", gap: space.md },
  meterLabel: { flex: 1 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
});
