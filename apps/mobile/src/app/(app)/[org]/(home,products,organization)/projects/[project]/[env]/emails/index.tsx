import type { EmailStatus } from "@coss/companion";
import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { Stack, useLocalSearchParams } from "expo-router";
import { Mail } from "lucide-react-native";
import { useState } from "react";
import { EmailRow } from "../../../../../../../../components/email-row";
import { type Filter, FilterChips } from "../../../../../../../../components/filters";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { useEmails, useEnvironment } from "../../../../../../../../lib/queries";
import { EMAIL_STATUS_LABELS, EMAIL_STATUS_TONE } from "../../../../../../../../lib/status";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

const STATUSES: EmailStatus[] = ["sent", "failed", "queued", "scheduled", "canceled"];
const FILTERS: Filter<EmailStatus>[] = [
  { value: null, label: "All" },
  ...STATUSES.map((status) => ({
    value: status,
    label: EMAIL_STATUS_LABELS[status],
    tone: EMAIL_STATUS_TONE[status],
  })),
];

export default function EmailsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const emails = useEmails(params, status);
  const items = emails.data?.pages.flatMap((page) => page.data) ?? [];
  const environment = useEnvironment(params).data;
  const keys = environment
    ? `${environment.project.name} · ${environment.environment.name}'s keys`
    : "this environment's keys";
  return (
    <Screen onRefresh={() => emails.refetch()} title="Emails">
      <Stack.Screen
        options={{ headerRight: () => <WebButton path={`${environmentPath(params)}/emails`} /> }}
      />
      <PageIntro
        description={`Every email sent with ${keys}, newest first. Emails are kept for ${formatRetentionDays(RETENTION_DAYS.emails)}.`}
        meta={<ModeBadge params={params} />}
        title="Emails"
      />
      <FilterChips items={FILTERS} onChange={setStatus} value={status} />
      <PagedPanel
        empty={{
          icon: Mail,
          title: status ? "Nothing found" : "No emails yet",
          description: status
            ? "No email matches these filters."
            : "Emails sent with this environment's API keys show up here.",
        }}
        items={items}
        olderLabel="Older emails"
        query={emails}
        render={(email) => <EmailRow email={email} key={email.id} params={params} />}
      />
    </Screen>
  );
}
