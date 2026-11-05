import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { Stack, useLocalSearchParams } from "expo-router";
import { Package } from "lucide-react-native";
import { Alert } from "../../../../../../../../components/alert";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow, Panel, SpecItem, SpecList } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo, formatBytes, formatDateTime } from "../../../../../../../../lib/format";
import { useLogDrain } from "../../../../../../../../lib/queries";
import {
  BATCH_STATUS,
  DRAIN_FORMAT_LABELS,
  drainStatus,
  sourcesSummary,
} from "../../../../../../../../lib/status";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// LOG_DRAIN_MAX_ATTEMPTS in @coss/webhooks (packages/webhooks/src/log-drain-delivery.ts).
const LOG_DRAIN_MAX_ATTEMPTS = 10;

function lastResult(batch: {
  last_attempt: { status_code: number | null; duration_ms: number; error: string | null } | null;
}): string {
  const attempt = batch.last_attempt;
  if (!attempt) return "Not attempted yet";
  if (attempt.status_code !== null)
    return `HTTP ${attempt.status_code} in ${attempt.duration_ms} ms`;
  return attempt.error ?? "—";
}

export default function LogDrainScreen() {
  const { drainId, ...params } = useLocalSearchParams<EnvironmentParams & { drainId: string }>();
  const query = useLogDrain(params, drainId);
  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const first = query.data.pages[0];
  if (!first) return <Screen loading="detail" />;
  const { drain, queued_lines } = first;
  const batches = query.data.pages.flatMap((page) => page.batches.data);
  const [tone, label] = drainStatus(drain);
  return (
    <Screen onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ title: "Log drain" }} />
      <WebButton path={`${environmentPath(params)}/log-drains/${drain.id}`} />
      <PageIntro
        description={drain.description || undefined}
        meta={
          <Badge variant="outline">
            <StatusDot label={label} tone={tone} />
          </Badge>
        }
        mono
        title={drain.url}
      />
      {!drain.enabled && drain.disabled_reason === "failing" ? (
        <Alert
          description={`A batch failed all ${LOG_DRAIN_MAX_ATTEMPTS} attempts, so coss.com disabled this drain${drain.disabled_at ? ` on ${formatDateTime(drain.disabled_at)}` : ""} and dropped the lines waiting for it. Fix the endpoint, then enable the drain again.`}
          title="Disabled after repeated failures"
          tone="error"
        />
      ) : null}
      <Panel title="Details">
        <SpecList>
          <SpecItem label="Sources">{sourcesSummary(drain.sources)}</SpecItem>
          <SpecItem label="Format">{DRAIN_FORMAT_LABELS[drain.format] ?? drain.format}</SpecItem>
          <SpecItem label="Auth header" mono>
            {drain.auth_header_name ?? "None"}
          </SpecItem>
          <SpecItem label="Waiting" mono>
            {queued_lines === 1 ? "1 line" : `${queued_lines} lines`}
          </SpecItem>
          <SpecItem label="Created" mono>
            {formatDateTime(drain.created_at)}
          </SpecItem>
        </SpecList>
      </Panel>
      <PagedPanel
        description={`Each batch is one request of up to 500 lines. Failed batches are retried for about a day (${LOG_DRAIN_MAX_ATTEMPTS} attempts); any 2xx response counts as sent. Batches are kept for ${formatRetentionDays(RETENTION_DAYS.logDrainBatches)}.`}
        empty={{
          icon: Package,
          title: "No batches yet",
          description: "Batches appear here as lines are written and sent.",
        }}
        items={batches}
        query={query}
        render={(batch) => {
          const [batchTone, batchLabel] = BATCH_STATUS[batch.status] ?? ["neutral", batch.status];
          return (
            <ListRow
              detail={formatAgo(batch.created_at)}
              key={batch.id}
              leading={<StatusDot tone={batchTone} />}
              subtitle={`${batchLabel} · ${lastResult(batch)}`}
              title={`${batch.line_count === 1 ? "1 line" : `${batch.line_count} lines`} · ${formatBytes(batch.byte_size)}`}
              trailing={
                <Badge mono variant="outline">
                  {`${batch.attempt_count}/${LOG_DRAIN_MAX_ATTEMPTS}`}
                </Badge>
              }
            />
          );
        }}
        title="Recent batches"
      />
    </Screen>
  );
}
