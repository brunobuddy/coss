import type { SmsStatus } from "@coss/companion";
import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { Stack, useLocalSearchParams } from "expo-router";
import { MessageSquare } from "lucide-react-native";
import { useState } from "react";
import { type Filter, FilterChips } from "../../../../../../../../components/filters";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { SmsRow } from "../../../../../../../../components/sms-row";
import { WebButton } from "../../../../../../../../components/web-button";
import { useEnvironment, useSmsList } from "../../../../../../../../lib/queries";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// The dashboard's filters (sms/page.tsx).
type FilterValue = "delivered" | "pending" | "failed";
const STATUSES: Record<FilterValue, readonly SmsStatus[]> = {
  delivered: ["delivered"],
  pending: ["queued", "scheduled", "sent"],
  failed: ["failed", "undelivered"],
};
const FILTERS: Filter<FilterValue>[] = [
  { value: null, label: "All" },
  { value: "delivered", label: "Delivered", tone: "success" },
  { value: "pending", label: "Pending", tone: "info" },
  { value: "failed", label: "Failed", tone: "error" },
];

export default function SmsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const [filter, setFilter] = useState<FilterValue | null>(null);
  const query = useSmsList(params, filter ? STATUSES[filter] : null);
  const mode = useEnvironment(params).data?.environment.mode;
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Screen onRefresh={() => query.refetch()} title="SMS">
      <Stack.Screen
        options={{ headerRight: () => <WebButton path={`${environmentPath(params)}/sms`} /> }}
      />
      <PageIntro
        description={`${
          mode === "sandbox"
            ? "Messages sent with this environment's keys. Sandbox messages are simulated: nothing reaches a phone."
            : "Messages sent with this environment's keys, from your organization's numbers."
        } Messages are kept for ${formatRetentionDays(RETENTION_DAYS.smsMessages)}.`}
        meta={<ModeBadge params={params} />}
        title="SMS"
      />
      <FilterChips items={FILTERS} onChange={setFilter} value={filter} />
      <PagedPanel
        empty={{
          icon: MessageSquare,
          title: filter ? "Nothing here" : "No messages yet",
          description: filter
            ? "No messages with this status."
            : "Send one with `coss.sms.send()` or `POST /v1/sms`.",
        }}
        items={items}
        olderLabel="Older messages"
        query={query}
        render={(sms) => <SmsRow key={sms.id} params={params} sms={sms} />}
      />
    </Screen>
  );
}
