import type { LogRange, LogSource } from "@coss/companion";
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollText } from "lucide-react-native";
import { useState } from "react";
import { StatusDot } from "../../../../../../../../components/badge";
import { type Filter, FilterChips } from "../../../../../../../../components/filters";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { SearchField } from "../../../../../../../../components/search-field";
import { Segmented } from "../../../../../../../../components/tabs";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../../lib/format";
import { logSummary } from "../../../../../../../../lib/logs";
import { useLogs } from "../../../../../../../../lib/queries";
import { LEVEL_TONE } from "../../../../../../../../lib/status";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

const SOURCES: Filter<LogSource>[] = [
  { value: null, label: "All" },
  { value: "api", label: "API" },
  { value: "email", label: "Email" },
  { value: "webhook", label: "Webhooks" },
  { value: "risk", label: "Risk" },
  { value: "smtp", label: "SMTP" },
  { value: "sms", label: "SMS" },
];

export default function LogsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const [range, setRange] = useState<LogRange>("24h");
  const [source, setSource] = useState<LogSource | null>(null);
  const [q, setQ] = useState("");
  const query = useLogs(params, { range, source, q });
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Screen onRefresh={() => query.refetch()} title="Logs">
      <Stack.Screen
        options={{ headerRight: () => <WebButton path={`${environmentPath(params)}/logs`} /> }}
      />
      <PageIntro
        description="Every API request made with this environment's keys, every email event and every webhook delivery attempt. Kept for 30 days."
        meta={<ModeBadge params={params} />}
        title="Logs"
      />
      <Segmented
        items={[
          { value: "1h", label: "Last hour" },
          { value: "24h", label: "24 hours" },
          { value: "7d", label: "7 days" },
        ]}
        onChange={setRange}
        value={range}
      />
      <SearchField mono onSubmit={setQ} placeholder="status:4xx email:… or text" value={q} />
      <FilterChips items={SOURCES} onChange={setSource} value={source} />
      <PagedPanel
        empty={{
          icon: ScrollText,
          title: q || source ? "No matching lines" : "Nothing logged yet",
          description: "Try a longer range, or another filter.",
        }}
        items={items}
        olderLabel="Older lines"
        query={query}
        render={(entry) => {
          const summary = logSummary(entry);
          return (
            <ListRow
              detail={formatAgo(entry.occurred_at)}
              href={{
                pathname: "/[org]/projects/[project]/[env]/logs/[logId]",
                params: { ...params, logId: entry.id },
              }}
              key={entry.id}
              leading={<StatusDot tone={LEVEL_TONE[entry.level] ?? "neutral"} />}
              subtitle={summary.subtitle || undefined}
              title={summary.title}
            />
          );
        }}
      />
    </Screen>
  );
}
