import { Stack, useLocalSearchParams } from "expo-router";
import { UsersRound } from "lucide-react-native";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo, formatCount } from "../../../../../../../../lib/format";
import { useAudiences } from "../../../../../../../../lib/queries-contacts";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from the dashboard's audiences/page.tsx.
export default function AudiencesScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useAudiences(params);
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Screen onRefresh={() => query.refetch()} title="Audiences">
      <WebButton path={`${environmentPath(params)}/audiences`} />
      <PageIntro
        description="Static lists of contacts. A broadcast to an audience goes to its subscribed members."
        title="Audiences"
      />
      <PagedPanel
        empty={{
          icon: UsersRound,
          title: "No audiences yet",
          description: "Group contacts into lists to send broadcasts to them.",
        }}
        items={items}
        query={query}
        render={(audience) => (
          <ListRow
            detail={formatAgo(audience.created_at)}
            href={{
              pathname: "/[org]/projects/[project]/[env]/audiences/[audienceId]",
              params: { ...params, audienceId: audience.id },
            }}
            key={audience.id}
            subtitle={`${formatCount(audience.contact_count)} ${audience.contact_count === 1 ? "contact" : "contacts"}`}
            title={audience.name}
          />
        )}
      />
    </Screen>
  );
}
