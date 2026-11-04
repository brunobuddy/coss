import type { DmarcOverviewResponse } from "@coss/companion";
import { RETENTION_DAYS } from "@coss/retention";
import { Stack, useLocalSearchParams } from "expo-router";
import { FileChartColumn } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../../../../../../components/alert";
import { Badge, StatusDot } from "../../../../../../../components/badge";
import { DomainTabs } from "../../../../../../../components/domain-tabs";
import { EmptyState } from "../../../../../../../components/empty";
import { PagedPanel } from "../../../../../../../components/paged";
import {
  ListRow,
  Panel,
  PanelBody,
  Ruled,
  SpecItem,
  SpecList,
} from "../../../../../../../components/panel";
import { ErrorState, Loading, PageIntro, Screen } from "../../../../../../../components/screen";
import { Stat, StatGrid } from "../../../../../../../components/stat";
import { Text } from "../../../../../../../components/text";
import { WebButton } from "../../../../../../../components/web-button";
import {
  formatAgo,
  formatCount,
  formatDateTime,
  formatPeriod,
} from "../../../../../../../lib/format";
import { useDmarc, useDmarcReports } from "../../../../../../../lib/queries-organization-settings";
import { DOMAIN_STATUS } from "../../../../../../../lib/status";
import {
  DMARC_NEXT_TITLE,
  DMARC_STAGE_INDEX,
  DMARC_STEPS,
  dmarcRate,
  dmarcRateTone,
} from "../../../../../../../lib/status-organization-settings";
import { colors, radius } from "../../../../../../../lib/theme";

// Copy from the dashboard's DMARC page (apps/web/src/app/[orgSlug]/domains/[domainId]/dmarc/page.tsx)
// and apps/web/src/lib/dmarc-status.ts. The page's daily chart is left out: the stats and sources
// carry the same numbers.

type Dmarc = DmarcOverviewResponse;

/** Whether receivers fully reject the domain's failing mail: the end of the path. */
function dmarcComplete(dmarc: Dmarc): boolean {
  return dmarc.policy === "reject" && !dmarc.partial;
}

function noNextStep(dmarc: Dmarc): string {
  const domainName = dmarc.domain.name;
  if (dmarcComplete(dmarc)) {
    const whose = dmarc.inherited_from ? ` (through ${dmarc.inherited_from}'s record)` : "";
    return dmarc.reporting
      ? `${domainName} rejects mail that fails DMARC${whose}, the strongest protection against spoofing. coss.com keeps reading the reports and tells owners and admins if its own mail starts failing.`
      : `${domainName} rejects mail that fails DMARC${whose}, the strongest protection against spoofing.`;
  }
  if (dmarc.report_address === null) {
    return "This coss.com deployment doesn't receive email, so it can't read DMARC reports or tell when a stricter policy is safe for this domain.";
  }
  return "There is nothing to change in this domain's DMARC record right now.";
}

function nextDescription(dmarc: Dmarc, next: NonNullable<Dmarc["next"]>): string {
  if (next.kind === "publish") {
    return "Start by monitoring: p=none changes nothing about delivery, but mailbox providers start sending reports about every source that sends as this domain.";
  }
  if (next.kind === "add_reporting") {
    return "Your record doesn't send aggregate reports to coss.com yet. This keeps your policy and your other report addresses, and adds coss.com's.";
  }
  if (next.kind === "complete_rollout") {
    return "Your record applies its policy to only part of the mail (pct or t=y). RFC 9989 removed pct; once the checks below pass, apply it in full.";
  }
  return next.policy === "quarantine"
    ? "With quarantine, mailbox providers move mail that fails DMARC to spam. Publish it once every check below passes."
    : `With reject, mailbox providers refuse mail that fails DMARC. Quarantine first runs for ${dmarc.days_at_quarantine} days to make sure none of your own mail is caught.`;
}

function Stepper({ dmarc }: { dmarc: Dmarc }) {
  const current = DMARC_STAGE_INDEX[dmarc.stage];
  const complete = dmarcComplete(dmarc);
  return (
    <View style={styles.steps}>
      {DMARC_STEPS.map((step, index) => {
        const done = index < current || (index === current && index === 3 && complete);
        const active = index === current && !done;
        return (
          <View key={step.label} style={[styles.step, active && styles.stepActive]}>
            <StatusDot
              label={`${index + 1}. ${step.label}`}
              muted={!done && !active}
              tone={done ? "success" : active ? "info" : "neutral"}
            />
            <Text muted variant="small">
              {step.detail}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function NextStep({ dmarc }: { dmarc: Dmarc }) {
  const { next } = dmarc;
  if (!next) return <Text variant="small">{noNextStep(dmarc)}</Text>;
  const [tone, label] =
    next.kind === "tighten" || next.kind === "complete_rollout"
      ? dmarc.ready
        ? (["success", "Ready"] as const)
        : (["warning", "Not ready yet"] as const)
      : (["info", "Safe to publish"] as const);
  return (
    <View style={styles.next}>
      <View style={styles.nextHead}>
        <Text style={styles.flex} variant="heading">
          {DMARC_NEXT_TITLE[next.kind]}
        </Text>
        <StatusDot label={label} tone={tone} />
      </View>
      <Text muted variant="small">
        {nextDescription(dmarc, next)}
      </Text>
      <View style={styles.record}>
        <Text muted variant="small">
          TXT record at _dmarc.{dmarc.domain.name}
        </Text>
        <Text selectable variant="mono">
          {next.record}
        </Text>
      </View>
      {dmarc.checks.map((check) => (
        <View key={check.id} style={styles.check}>
          <View style={styles.checkDot}>
            <StatusDot tone={check.ok ? "success" : "warning"} />
          </View>
          <Text style={styles.flex} variant="small">
            {check.message}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A report's period (UTC days, end exclusive): one day, or the range it covers. */
function reportPeriod(start: string, end: string): string {
  const [from, to] = formatPeriod({ start, end }).split(" – ");
  return from === to ? (from ?? "") : `${from} – ${to}`;
}

function Reports(props: {
  org: string;
  domainId: string;
  query: ReturnType<typeof useDmarcReports>;
}) {
  const { org, domainId, query } = props;
  const reports = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <PagedPanel
      description={`Reports are kept for ${RETENTION_DAYS.dmarcReports} days.`}
      empty={{ icon: FileChartColumn, title: "No reports received yet." }}
      items={reports}
      query={query}
      render={(report) => (
        <ListRow
          detail={dmarcRate(report.passing, report.messages)}
          href={{
            pathname: "/[org]/domains/[domainId]/dmarc/[reportId]",
            params: { org, domainId, reportId: report.id },
          }}
          key={report.id}
          subtitle={reportPeriod(report.period_start, report.period_end)}
          title={report.reporter}
          trailing={
            <Text muted variant="mono">
              {formatCount(report.messages)} · {formatAgo(report.received_at)}
            </Text>
          }
        />
      )}
      title="Reports"
    />
  );
}

export default function DmarcScreen() {
  const { org, domainId } = useLocalSearchParams<{ org: string; domainId: string }>();
  const query = useDmarc(org, domainId);
  const reports = useDmarcReports(org, domainId);
  if (query.isPending) return <Loading />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const dmarc = query.data;
  const { summary } = dmarc;
  const [tone, label] = DOMAIN_STATUS[dmarc.domain.status] ?? ["neutral", dmarc.domain.status];
  const unauthenticated =
    summary.messages - summary.passing - (summary.coss_messages - summary.coss_passing);
  return (
    <Screen onRefresh={() => Promise.all([query.refetch(), reports.refetch()])} title="DMARC">
      <Stack.Screen
        options={{
          headerRight: () => <WebButton path={`/${org}/domains/${dmarc.domain.id}/dmarc`} />,
        }}
      />
      <PageIntro
        description="Who sends as this domain, whether their mail authenticates, and the path from monitoring to rejecting spoofed mail."
        meta={
          <Badge variant="outline">
            <StatusDot label={label} tone={tone} />
          </Badge>
        }
        mono
        title={dmarc.domain.name}
      />
      <DomainTabs domainId={dmarc.domain.id} org={org} value="dmarc" />
      {dmarc.warnings.map((warning) => (
        <Alert description={warning} key={warning} tone="warning" />
      ))}
      <Panel title="Policy">
        <PanelBody gap={20}>
          <Stepper dmarc={dmarc} />
          <NextStep dmarc={dmarc} />
        </PanelBody>
        <View style={styles.rule} />
        <SpecList>
          <SpecItem label="Published record" mono={Boolean(dmarc.record)} stacked>
            {dmarc.record
              ? dmarc.record
              : dmarc.stage === "not_checked"
                ? "Not checked yet"
                : dmarc.inherited_from
                  ? `None of its own: ${dmarc.inherited_from}'s applies`
                  : "None found"}
          </SpecItem>
          <SpecItem label="Policy since" mono>
            {formatDateTime(dmarc.policy_since)}
          </SpecItem>
          <SpecItem label="Reports">
            {dmarc.reporting ? (
              <StatusDot label="Sent to coss.com" tone="success" />
            ) : (
              <StatusDot label="Not sent to coss.com" tone="neutral" />
            )}
          </SpecItem>
          {dmarc.report_address ? (
            <SpecItem label="Report address" mono stacked>
              {dmarc.report_address}
            </SpecItem>
          ) : null}
        </SpecList>
      </Panel>
      <StatGrid>
        <Stat
          detail={`last ${summary.window_days} days`}
          label="Messages reported"
          value={formatCount(summary.messages)}
        />
        <Stat
          detail={`${formatCount(summary.passing)} passed`}
          label="DMARC pass rate"
          value={dmarcRate(summary.passing, summary.messages)}
        />
        <Stat
          detail={`${formatCount(summary.coss_messages)} messages`}
          label="Sent through coss.com"
          value={dmarcRate(summary.coss_passing, summary.coss_messages)}
        />
        <Stat
          detail="failing, not through coss.com"
          label="Unauthenticated"
          value={formatCount(Math.max(0, unauthenticated))}
        />
      </StatGrid>
      <Panel
        description={`The sources that sent as ${dmarc.domain.name} in the last ${summary.window_days} days, most messages first.`}
        title="Sources"
      >
        {summary.sources.length === 0 ? (
          <EmptyState
            description={
              dmarc.report_address
                ? `Mailbox providers send a report about each day's mail, usually within a day or two, once the DMARC record names ${dmarc.report_address}.`
                : "This deployment doesn't receive email, so it can't receive DMARC reports."
            }
            icon={FileChartColumn}
            title="No reports yet"
          />
        ) : (
          <Ruled>
            {summary.sources.map((source) => (
              <View
                key={`${source.source_ip} ${source.header_from} ${source.via_coss}`}
                style={styles.source}
              >
                <View style={styles.sourceHead}>
                  <Text selectable style={styles.flex} variant="mono">
                    {source.source_ip}
                  </Text>
                  {source.via_coss ? <Badge variant="outline">coss.com</Badge> : null}
                </View>
                <View style={styles.sourceHead}>
                  <Text muted selectable style={styles.flex} variant="mono">
                    {source.header_from}
                  </Text>
                  <Text muted variant="mono">
                    {formatCount(source.messages)}
                  </Text>
                  <StatusDot
                    label={dmarcRate(source.passing, source.messages)}
                    tone={dmarcRateTone(source.passing, source.messages)}
                  />
                </View>
              </View>
            ))}
          </Ruled>
        )}
      </Panel>
      <Reports domainId={domainId} org={org} query={reports} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  steps: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  step: {
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: -StyleSheet.hairlineWidth,
  },
  stepActive: { backgroundColor: colors.muted },
  next: { gap: 12 },
  nextHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  record: {
    gap: 4,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  check: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  checkDot: { paddingTop: 6 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  source: { gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
  sourceHead: { flexDirection: "row", alignItems: "center", gap: 10 },
});
