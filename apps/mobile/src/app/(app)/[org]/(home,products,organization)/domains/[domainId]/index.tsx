import type { DnsRecord } from "@coss/companion";
import { Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../../../../../components/alert";
import { Badge, StatusDot } from "../../../../../../components/badge";
import { DomainTabs } from "../../../../../../components/domain-tabs";
import { Panel, Ruled, SpecItem, SpecList } from "../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../components/screen";
import { Text } from "../../../../../../components/text";
import { WebButton } from "../../../../../../components/web-button";
import { formatDateTime } from "../../../../../../lib/format";
import { useDomain } from "../../../../../../lib/queries";
import { DOMAIN_STATUS, RECORD_STATUS, TRACKING_STATUS } from "../../../../../../lib/status";

// Copied from the dashboard's domain page (apps/web/src/app/[orgSlug]/domains/[domainId]).
const STATUS_HELP: Record<string, string> = {
  pending:
    "Publish the records below at your DNS provider. Verification usually takes a few minutes, " +
    "sometimes up to 72 hours; we check automatically.",
  verified: "Live API keys can send from any address at this domain.",
  temporary_failure:
    "The DKIM records can't be found right now. Sending is blocked until they are back.",
  failed:
    "The records weren't found within 72 hours, so verification stopped. Restart it to get new " +
    "records to publish.",
  deleting: "This domain is being removed. If it stays here, delete it again to finish.",
};

const TRACKING_STATUS_HELP: Record<string, string> = {
  pending:
    "Publish the CNAME record below. Once it resolves, a certificate is issued for the hostname " +
    "(usually within minutes, at most 72 hours); we check automatically.",
  active: "Open pixels and click links of emails sent from this domain use this hostname.",
  temporary_failure:
    "The hostname stopped working, so emails use coss.com's tracking host until it is back. Check " +
    "that the CNAME record is still in place.",
  failed:
    "The hostname couldn't be set up within 72 hours, so setup stopped. Fix the CNAME record, " +
    "then restart it.",
  deleting: "This tracking domain is being removed.",
};

const PURPOSE: Record<string, string> = {
  dkim: "DKIM: proves emails from this domain are really from you.",
  mail_from_mx: "MAIL FROM: receives bounces and complaints.",
  mail_from_spf: "SPF: authorizes the provider to send for the MAIL FROM subdomain.",
  dmarc: "DMARC (recommended): tells mailbox providers what to do with unauthenticated mail.",
};

function Record({ record }: { record: DnsRecord }) {
  const [tone, label] = RECORD_STATUS[record.status] ?? ["neutral", record.status];
  return (
    <View style={styles.record}>
      <View style={styles.recordHead}>
        <Badge mono variant="outline">
          {record.type}
        </Badge>
        <View style={styles.purpose} />
        <StatusDot label={label} tone={tone} />
      </View>
      {PURPOSE[record.purpose] ? (
        <Text muted variant="small">
          {PURPOSE[record.purpose]}
        </Text>
      ) : null}
      <View style={styles.field}>
        <Text muted variant="small">
          Name
        </Text>
        <Text selectable variant="mono">
          {record.name}
        </Text>
      </View>
      <View style={styles.field}>
        <Text muted variant="small">
          Value
        </Text>
        <Text selectable variant="mono">
          {record.priority !== null ? `${record.priority} ${record.value}` : record.value}
        </Text>
      </View>
      {record.found.length > 0 && record.status !== "verified" ? (
        <Text muted selectable variant="mono">
          Found: {record.found.join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

export default function DomainScreen() {
  const { org, domainId } = useLocalSearchParams<{ org: string; domainId: string }>();
  const query = useDomain(org, domainId);
  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const domain = query.data;
  const [tone, label] = DOMAIN_STATUS[domain.status] ?? ["neutral", domain.status];
  return (
    <Screen onRefresh={() => query.refetch()} title={domain.name}>
      <WebButton path={`/${org}/domains/${domain.id}`} />
      <PageIntro
        description={STATUS_HELP[domain.status]}
        meta={
          <Badge variant="outline">
            <StatusDot label={label} tone={tone} />
          </Badge>
        }
        mono
        title={domain.name}
      />
      <DomainTabs domainId={domain.id} org={org} value="overview" />
      <Panel description="Add these at your DNS provider." title="DNS records">
        <Ruled>
          {domain.records.map((record) => (
            <Record key={`${record.purpose}:${record.name}`} record={record} />
          ))}
        </Ruled>
      </Panel>
      <Panel title="Details">
        <SpecList>
          <SpecItem label="MAIL FROM" mono>
            {domain.mail_from_domain ?? "—"}
          </SpecItem>
          <SpecItem label="Verified" mono>
            {formatDateTime(domain.verified_at)}
          </SpecItem>
          <SpecItem label="Last checked" mono>
            {formatDateTime(domain.last_checked_at)}
          </SpecItem>
          <SpecItem label="Added" mono>
            {formatDateTime(domain.created_at)}
          </SpecItem>
        </SpecList>
      </Panel>
      {domain.tracking ? (
        <Panel
          action={
            <StatusDot
              label={
                (TRACKING_STATUS[domain.tracking.status] ?? ["neutral", domain.tracking.status])[1]
              }
              tone={(TRACKING_STATUS[domain.tracking.status] ?? ["neutral"])[0]}
            />
          }
          description={domain.tracking.hostname}
          descriptionMono
          footer={TRACKING_STATUS_HELP[domain.tracking.status]}
          title="Tracking domain"
        >
          {domain.tracking.message ? (
            <View style={styles.alert}>
              <Alert description={domain.tracking.message} title="Not active yet" tone="warning" />
            </View>
          ) : null}
          <Record record={domain.tracking.record} />
        </Panel>
      ) : null}
      {domain.receiving ? (
        <Panel
          description={`${domain.receiving.hostname} → ${domain.receiving.environment ?? "an environment"}`}
          title="Receiving"
        >
          <Record record={domain.receiving.record} />
        </Panel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  record: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  field: { gap: 2 },
  recordHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 4 },
  purpose: { flex: 1 },
  alert: { padding: 12, paddingBottom: 0 },
});
