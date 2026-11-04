import type { MobileDmarcRecord } from "@coss/companion";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Badge, StatusDot } from "../../../../../../../components/badge";
import { Panel, Ruled, SpecItem, SpecList } from "../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../components/screen";
import { Text } from "../../../../../../../components/text";
import { WebButton } from "../../../../../../../components/web-button";
import { formatCount, formatDateTime } from "../../../../../../../lib/format";
import { useDmarcReport } from "../../../../../../../lib/queries-organization-settings";
import { dmarcResultTone } from "../../../../../../../lib/status-organization-settings";

// Copy from the dashboard's DMARC report page
// (apps/web/src/app/[orgSlug]/domains/[domainId]/dmarc/[reportId]/page.tsx).

function Row({ record }: { record: MobileDmarcRecord }) {
  return (
    <View style={styles.row}>
      <View style={styles.line}>
        <Text selectable style={styles.flex} variant="mono">
          {record.source_ip}
        </Text>
        {record.via_coss ? <Badge variant="outline">coss.com</Badge> : null}
        <Text variant="mono">{formatCount(record.count)}</Text>
      </View>
      <Text selectable variant="mono">
        {record.header_from}
      </Text>
      {record.envelope_from ? (
        <Text muted selectable variant="mono">
          {record.envelope_from}
        </Text>
      ) : null}
      <View style={styles.results}>
        <Text muted variant="small">
          DKIM
        </Text>
        <StatusDot label={record.dkim} tone={dmarcResultTone(record.dkim)} />
        <Text muted variant="small">
          SPF
        </Text>
        <StatusDot label={record.spf} tone={dmarcResultTone(record.spf)} />
        <Text muted variant="small">
          Applied
        </Text>
        <Text variant="small">{record.disposition}</Text>
      </View>
      {record.reasons.map((reason) => (
        <Text key={reason.type} muted variant="small">
          {reason.type}
          {reason.comment ? `: ${reason.comment}` : ""}
        </Text>
      ))}
    </View>
  );
}

export default function DmarcReportScreen() {
  const { org, domainId, reportId } = useLocalSearchParams<{
    org: string;
    domainId: string;
    reportId: string;
  }>();
  const query = useDmarcReport(org, domainId, reportId);
  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { domain, report } = query.data;
  const title = `Report from ${report.reporter}`;
  return (
    <Screen onRefresh={() => query.refetch()} title={title}>
      <WebButton path={`/${org}/domains/${domain.id}/dmarc/${report.id}`} />
      <PageIntro
        description={`What ${report.reporter} saw of mail claiming to be from ${domain.name} between ${formatDateTime(report.period_start)} and ${formatDateTime(report.period_end)}.`}
        meta={report.truncated ? <Badge variant="warning">Truncated to 10,000 rows</Badge> : null}
        title={title}
      />
      <Panel title="Details">
        <SpecList>
          <SpecItem label="Reporter">{report.reporter}</SpecItem>
          {report.reporter_email ? (
            <SpecItem label="Contact" mono>
              {report.reporter_email}
            </SpecItem>
          ) : null}
          <SpecItem label="Report ID" mono>
            {report.report_id}
          </SpecItem>
          <SpecItem label="Messages" mono>
            {formatCount(report.messages)}
          </SpecItem>
          <SpecItem label="Passed DMARC" mono>
            {formatCount(report.passing)}
          </SpecItem>
          <SpecItem label="Policy seen" mono>
            {report.policy_seen}
          </SpecItem>
          <SpecItem label="Received" mono>
            {formatDateTime(report.received_at)}
          </SpecItem>
        </SpecList>
      </Panel>
      <Panel
        footer={
          report.records.length < report.record_count
            ? `Showing the first ${formatCount(report.records.length)}. Open the report on coss.com for every row.`
            : undefined
        }
        title={`${formatCount(report.record_count)} rows`}
      >
        <Ruled>
          {report.records.map((record, index) => (
            // Rows have no id of their own; their position is stable.
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are ordered as reported
            <Row key={index} record={record} />
          ))}
        </Ruled>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
  line: { flexDirection: "row", alignItems: "center", gap: 10 },
  results: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 8,
    rowGap: 4,
    paddingTop: 4,
  },
});
