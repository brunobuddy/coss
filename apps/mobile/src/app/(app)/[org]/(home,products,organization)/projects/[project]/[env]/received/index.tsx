import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { useLocalSearchParams } from "expo-router";
import { Inbox } from "lucide-react-native";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../../lib/format";
import { useReceivedEmails } from "../../../../../../../../lib/queries";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

export default function ReceivedScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useReceivedEmails(params);
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Screen onRefresh={() => query.refetch()} title="Received emails">
      <WebButton path={`${environmentPath(params)}/received`} />
      <PageIntro
        description={`Emails sent to this environment's addresses. Each one also triggers an email.received webhook. Received emails are kept for ${formatRetentionDays(RETENTION_DAYS.receivedEmails)}.`}
        meta={<ModeBadge params={params} />}
        title="Received emails"
      />
      <PagedPanel
        empty={{
          tone: "email",
          icon: Inbox,
          title: "No received emails yet",
          description: "Emails sent to this environment's addresses show up here.",
        }}
        items={items}
        query={query}
        render={(email) => (
          <ListRow
            detail={formatAgo(email.received_at)}
            href={{
              pathname: "/[org]/projects/[project]/[env]/received/[id]",
              params: { ...params, id: email.id },
            }}
            key={email.id}
            leading={<StatusDot tone={email.status === "blocked" ? "error" : "success"} />}
            subtitle={email.from ?? (email.mail_from || "—")}
            title={email.subject || "(no subject)"}
            trailing={email.spam ? <Badge variant="warning">spam</Badge> : undefined}
          />
        )}
      />
    </Screen>
  );
}
