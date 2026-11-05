import { useLocalSearchParams } from "expo-router";
import { UsersRound } from "lucide-react-native";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatCount } from "../../../../../../../../lib/format";
import { useAudience } from "../../../../../../../../lib/queries-contacts";
import { CONTACT_STATUS } from "../../../../../../../../lib/status-contacts";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from the dashboard's audiences/[audienceId]/page.tsx.
export default function AudienceScreen() {
  const { audienceId, ...params } = useLocalSearchParams<
    EnvironmentParams & { audienceId: string }
  >();
  const query = useAudience(params, audienceId);

  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const first = query.data.pages[0];
  if (!first) return <Screen loading="detail" />;
  const { audience } = first;
  const members = query.data.pages.flatMap((page) => page.members.data);

  return (
    <Screen onRefresh={() => query.refetch()} title={audience.name}>
      <WebButton path={`${environmentPath(params)}/audiences/${audience.id}`} />
      <PageIntro
        description={`${formatCount(audience.contact_count)} ${audience.contact_count === 1 ? "contact" : "contacts"}.`}
        title={audience.name}
      />
      <PagedPanel
        empty={{ tone: "marketing", icon: UsersRound, title: "No contacts in this audience yet." }}
        items={members}
        query={query}
        render={(contact) => {
          const [tone, label] = CONTACT_STATUS[contact.status];
          return (
            <ListRow
              href={{
                pathname: "/[org]/projects/[project]/[env]/contacts/[contactId]",
                params: { ...params, contactId: contact.id },
              }}
              key={contact.id}
              title={contact.email}
              trailing={
                <Badge variant="outline">
                  <StatusDot label={label} tone={tone} />
                </Badge>
              }
            />
          );
        }}
        title="Members"
      />
    </Screen>
  );
}
