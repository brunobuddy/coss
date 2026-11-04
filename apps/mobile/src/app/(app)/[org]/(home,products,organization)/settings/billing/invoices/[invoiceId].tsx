import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Badge, StatusDot } from "../../../../../../../components/badge";
import { Panel, Ruled, SpecItem, SpecList } from "../../../../../../../components/panel";
import { ErrorState, Loading, PageIntro, Screen } from "../../../../../../../components/screen";
import { Text } from "../../../../../../../components/text";
import {
  formatCount,
  formatDateTime,
  formatMoney,
  formatPeriod,
} from "../../../../../../../lib/format";
import { useInvoice } from "../../../../../../../lib/queries";
import { invoiceStatus } from "../../../../../../../lib/status";

export default function InvoiceScreen() {
  const { org, invoiceId } = useLocalSearchParams<{ org: string; invoiceId: string }>();
  const query = useInvoice(org, invoiceId);
  if (query.isPending) return <Loading />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const invoice = query.data;
  const [tone, label] = invoiceStatus(invoice);
  const title = invoice.number ?? "Invoice";
  return (
    <Screen onRefresh={() => query.refetch()} title={title}>
      <PageIntro
        description={invoice.period ? formatPeriod(invoice.period) : undefined}
        meta={
          <Badge variant="outline">
            <StatusDot label={label} tone={tone} />
          </Badge>
        }
        title={title}
      />
      <Panel title="Lines">
        <Ruled>
          {invoice.lines.map((line) => (
            <View key={line.id} style={styles.line}>
              <View style={styles.lineText}>
                <Text variant="label">{line.description}</Text>
                {line.quantity !== null ? (
                  <Text muted variant="mono">
                    {formatCount(line.quantity)}
                  </Text>
                ) : null}
              </View>
              <Text variant="mono">{formatMoney(line.amount)}</Text>
            </View>
          ))}
        </Ruled>
      </Panel>
      <Panel title="Summary">
        <SpecList>
          <SpecItem label="Subtotal" mono>
            {formatMoney(invoice.subtotal)}
          </SpecItem>
          {invoice.discount ? (
            <SpecItem label="Discount" mono>
              {`−${formatMoney(invoice.discount)}`}
            </SpecItem>
          ) : null}
          {invoice.credit ? (
            <SpecItem label="Credit" mono>
              {`−${formatMoney(invoice.credit)}`}
            </SpecItem>
          ) : null}
          {invoice.tax ? (
            <SpecItem label="Tax" mono>
              {formatMoney(invoice.tax)}
            </SpecItem>
          ) : null}
          <SpecItem label="Total" mono>
            {formatMoney(invoice.total)}
          </SpecItem>
          <SpecItem label="Paid" mono>
            {formatMoney(invoice.amount_paid)}
          </SpecItem>
          <SpecItem label="Amount due" mono>
            {formatMoney(invoice.amount_due)}
          </SpecItem>
          <SpecItem label="Finalized" mono>
            {formatDateTime(invoice.finalized_at)}
          </SpecItem>
          {invoice.status === "open" ? (
            <SpecItem label="Due" mono>
              {formatDateTime(invoice.due_at)}
            </SpecItem>
          ) : null}
          {invoice.paid_at ? (
            <SpecItem label="Paid on" mono>
              {formatDateTime(invoice.paid_at)}
            </SpecItem>
          ) : null}
        </SpecList>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 },
  lineText: { flex: 1, gap: 2 },
});
