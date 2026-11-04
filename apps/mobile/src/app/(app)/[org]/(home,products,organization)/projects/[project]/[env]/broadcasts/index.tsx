import type { MobileBroadcastSummary } from "@coss/companion";
import { Stack, useLocalSearchParams } from "expo-router";
import { Send } from "lucide-react-native";
import { StatusDot } from "../../../../../../../../components/badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo, formatCount, formatPercent } from "../../../../../../../../lib/format";
import { useBroadcasts } from "../../../../../../../../lib/queries-broadcasts";
import {
  BROADCAST_STATUS_LABELS,
  BROADCAST_STATUS_TONE,
} from "../../../../../../../../lib/status-broadcasts";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// The table's columns of the dashboard's broadcasts/page.tsx, as one line.
function summary(broadcast: MobileBroadcastSummary): string {
  const { stats, tracking } = broadcast;
  const rate = (count: number) =>
    stats.delivered > 0 ? formatPercent(count / stats.delivered) : "—";
  return [
    BROADCAST_STATUS_LABELS[broadcast.status],
    `${formatCount(stats.recipients)} recipients`,
    `${formatCount(stats.delivered)} delivered`,
    ...(tracking.opens ? [`${rate(stats.opened)} opened`] : []),
    ...(tracking.clicks ? [`${rate(stats.clicked)} clicked`] : []),
  ].join(" · ");
}

function BroadcastRow(props: { broadcast: MobileBroadcastSummary; params: EnvironmentParams }) {
  const { broadcast } = props;
  return (
    <ListRow
      detail={formatAgo(broadcast.updated_at)}
      href={{
        pathname: "/[org]/projects/[project]/[env]/broadcasts/[broadcastId]",
        params: { ...props.params, broadcastId: broadcast.id },
      }}
      leading={<StatusDot tone={BROADCAST_STATUS_TONE[broadcast.status]} />}
      subtitle={summary(broadcast)}
      title={broadcast.name}
    />
  );
}

// Copy from the dashboard's broadcasts/page.tsx.
export default function BroadcastsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useBroadcasts(params);
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Screen onRefresh={() => query.refetch()} title="Broadcasts">
      <Stack.Screen
        options={{
          headerRight: () => <WebButton path={`${environmentPath(params)}/broadcasts`} />,
        }}
      />
      <PageIntro
        description="One marketing email to an audience or a segment, sent at your plan's pace, with its own stats."
        title="Broadcasts"
      />
      <PagedPanel
        empty={{
          icon: Send,
          title: "No broadcasts yet",
          description:
            "Write a newsletter or an announcement, pick who gets it, and send or schedule it.",
        }}
        items={items}
        query={query}
        render={(broadcast) => (
          <BroadcastRow broadcast={broadcast} key={broadcast.id} params={params} />
        )}
      />
    </Screen>
  );
}
