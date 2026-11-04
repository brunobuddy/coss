import { useLocalSearchParams } from "expo-router";
import { Filter } from "lucide-react-native";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../../lib/format";
import { useSegments } from "../../../../../../../../lib/queries-contacts";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from the dashboard's segments/page.tsx.
export default function SegmentsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useSegments(params);
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Screen onRefresh={() => query.refetch()} title="Segments">
      <WebButton path={`${environmentPath(params)}/segments`} />
      <PageIntro
        description="Filters over this environment's contacts, evaluated whenever they're used, so they're always current."
        title="Segments"
      />
      <PagedPanel
        empty={{
          tone: "marketing",
          icon: Filter,
          title: "No segments yet",
          description: "Filter contacts by their properties, audiences, topics or email domain.",
        }}
        items={items}
        query={query}
        render={(segment) => (
          <ListRow
            detail={formatAgo(segment.updated_at)}
            href={{
              pathname: "/[org]/projects/[project]/[env]/segments/[segmentId]",
              params: { ...params, segmentId: segment.id },
            }}
            key={segment.id}
            subtitle={`Conditions: ${segment.condition_count} (${segment.match})`}
            title={segment.name}
          />
        )}
      />
    </Screen>
  );
}
