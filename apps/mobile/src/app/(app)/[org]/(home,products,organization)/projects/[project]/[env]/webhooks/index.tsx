import { useLocalSearchParams } from "expo-router";
import { Webhook } from "lucide-react-native";
import { StatusDot } from "../../../../../../../../components/badge";
import { EmptyState } from "../../../../../../../../components/empty";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { ListRow, Panel, Ruled } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { plural } from "../../../../../../../../lib/format";
import { useWebhookEndpoints } from "../../../../../../../../lib/queries";
import { endpointStatus } from "../../../../../../../../lib/status";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

export default function WebhooksScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useWebhookEndpoints(params);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  return (
    <Screen onRefresh={() => query.refetch()} title="Webhooks">
      <WebButton path={`${environmentPath(params)}/webhooks`} />
      <PageIntro
        description="Signed notifications of email delivery events and reputation changes in this environment."
        meta={<ModeBadge params={params} />}
        title="Webhooks"
      />
      <Panel>
        {query.data.data.length === 0 ? (
          <EmptyState
            description="Add an endpoint to be notified when emails are delivered, bounce or receive complaints."
            icon={Webhook}
            title="No endpoints yet"
          />
        ) : (
          <Ruled>
            {query.data.data.map((endpoint) => {
              const [tone, label] = endpointStatus(endpoint);
              return (
                <ListRow
                  href={{
                    pathname: "/[org]/projects/[project]/[env]/webhooks/[endpointId]",
                    params: { ...params, endpointId: endpoint.id },
                  }}
                  key={endpoint.id}
                  leading={<StatusDot tone={tone} />}
                  subtitle={[
                    endpoint.description,
                    label,
                    endpoint.event_types.length === 0
                      ? "All events"
                      : plural(endpoint.event_types.length, "event"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  title={endpoint.url}
                />
              );
            })}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}
