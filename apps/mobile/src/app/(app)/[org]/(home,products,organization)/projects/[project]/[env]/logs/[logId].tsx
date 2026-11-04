import { type Href, router, Stack, useLocalSearchParams } from "expo-router";
import { History } from "lucide-react-native";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import { Button } from "../../../../../../../../components/button";
import { CodeBlock } from "../../../../../../../../components/code-block";
import { EmptyState } from "../../../../../../../../components/empty";
import {
  ListRow,
  Panel,
  Ruled,
  SpecItem,
  SpecList,
} from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Text } from "../../../../../../../../components/text";
import { formatDateTime, formatTime } from "../../../../../../../../lib/format";
import { logSummary } from "../../../../../../../../lib/logs";
import { useLogEntry } from "../../../../../../../../lib/queries";
import { LEVEL_TONE } from "../../../../../../../../lib/status";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function LogEntryScreen() {
  const { logId, ...params } = useLocalSearchParams<EnvironmentParams & { logId: string }>();
  const query = useLogEntry(params, logId);
  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { entry, related } = query.data;
  const summary = logSummary(entry);
  const base = environmentPath(params);
  const optional = (label: string, value: string | number | null, mono = true) =>
    value === null || value === "" ? null : (
      <SpecItem key={label} label={label} mono={mono}>
        {String(value)}
      </SpecItem>
    );
  return (
    <Screen onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ title: "Log line" }} />
      <PageIntro
        meta={
          <>
            <Badge variant="outline">
              <StatusDot label={entry.level} tone={LEVEL_TONE[entry.level] ?? "neutral"} />
            </Badge>
            <Badge mono variant="secondary">
              {entry.type}
            </Badge>
          </>
        }
        mono
        title={summary.title}
      />
      {entry.resource_type === "email" && entry.resource_id ? (
        <Button
          onPress={() => router.push(`${base}/emails/${entry.resource_id}` as Href)}
          size="sm"
          title="View email"
          variant="outline"
        />
      ) : null}
      <Panel title="Overview">
        <SpecList>
          <SpecItem label="Time" mono>
            {formatDateTime(entry.occurred_at)}
          </SpecItem>
          <SpecItem label="Message">{entry.message}</SpecItem>
          {optional("Request", entry.request_id)}
          {optional("API key", entry.api_key_name ?? entry.api_key_id, !entry.api_key_name)}
          {optional("Status", entry.status_code)}
          {optional("Duration", entry.duration_ms === null ? null : `${entry.duration_ms} ms`)}
          {optional("Error", entry.error_code)}
          {optional("Resource", entry.resource_id)}
          {optional("Recipient", entry.recipient)}
          {optional("Client IP", entry.client_ip)}
          {optional("User agent", entry.user_agent)}
        </SpecList>
      </Panel>
      {Object.keys(entry.attributes).length > 0 ? (
        <Panel title={entry.source === "api" ? "Request and response" : "Details"}>
          <CodeBlock>{JSON.stringify(entry.attributes, null, 2)}</CodeBlock>
        </Panel>
      ) : null}
      <Panel description="Lines of the same request or resource, oldest first." title="Timeline">
        {related.length === 0 ? (
          <EmptyState icon={History} title="No related lines" />
        ) : (
          <Ruled>
            {related.map((line) => {
              const lineSummary = logSummary(line);
              return (
                <ListRow
                  detail={
                    sameDay(line.occurred_at, entry.occurred_at)
                      ? formatTime(line.occurred_at)
                      : formatDateTime(line.occurred_at)
                  }
                  href={{
                    pathname: "/[org]/projects/[project]/[env]/logs/[logId]",
                    params: { ...params, logId: line.id },
                  }}
                  key={line.id}
                  leading={<StatusDot tone={LEVEL_TONE[line.level] ?? "neutral"} />}
                  subtitle={lineSummary.subtitle || undefined}
                  title={lineSummary.title}
                />
              );
            })}
          </Ruled>
        )}
      </Panel>
      <Text muted variant="mono">
        {entry.id}
      </Text>
    </Screen>
  );
}
