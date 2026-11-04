import { useLocalSearchParams } from "expo-router";
import { Send, Webhook } from "lucide-react-native";
import { StatusDot } from "../../../../../../../../../components/badge";
import { EmptyState } from "../../../../../../../../../components/empty";
import { ListRow, Panel, Ruled } from "../../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../../components/screen";
import { Text } from "../../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../../../lib/format";
import { useHookApplication } from "../../../../../../../../../lib/queries";
import { endpointStatus } from "../../../../../../../../../lib/status";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../../lib/web";

export default function HookApplicationScreen() {
  const { applicationId, ...params } = useLocalSearchParams<
    EnvironmentParams & { applicationId: string }
  >();
  const query = useHookApplication(params, applicationId);
  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { application, endpoints, messages } = query.data;
  return (
    <Screen onRefresh={() => query.refetch()} title={application.name}>
      <WebButton path={`${environmentPath(params)}/hooks/${application.id}`} />
      <PageIntro
        meta={
          <Text muted selectable variant="mono">
            {application.uid ? `${application.uid} · ${application.id}` : application.id}
          </Text>
        }
        title={application.name}
      />
      <Panel
        description="Where this application's messages go. Its users can manage them in the portal."
        title="Endpoints"
      >
        {endpoints.length === 0 ? (
          <EmptyState
            tone="hooks"
            description="Add one here, or let the application's users add theirs in the portal."
            icon={Webhook}
            title="No endpoints yet"
          />
        ) : (
          <Ruled>
            {endpoints.map((endpoint) => {
              const [tone, label] = endpointStatus(endpoint);
              return (
                <ListRow
                  href={{
                    pathname:
                      "/[org]/projects/[project]/[env]/hooks/[applicationId]/endpoints/[endpointId]",
                    params: { ...params, applicationId: application.id, endpointId: endpoint.id },
                  }}
                  key={endpoint.id}
                  leading={<StatusDot tone={tone} />}
                  subtitle={`${label} · ${endpoint.filter_types.length === 0 ? "All" : endpoint.filter_types.join(", ")}`}
                  title={endpoint.url}
                />
              );
            })}
          </Ruled>
        )}
      </Panel>
      <Panel description="The last 20 messages sent to this application." title="Recent messages">
        {messages.length === 0 ? (
          <EmptyState
            tone="hooks"
            description="Messages you send to this application show up here."
            icon={Send}
            title="No messages yet"
          />
        ) : (
          <Ruled>
            {messages.map((message) => (
              <ListRow
                detail={formatAgo(message.created_at)}
                href={{
                  pathname:
                    "/[org]/projects/[project]/[env]/hooks/[applicationId]/messages/[messageId]",
                  params: { ...params, applicationId: application.id, messageId: message.id },
                }}
                key={message.id}
                subtitle={message.id}
                title={message.event_type}
              />
            ))}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}
