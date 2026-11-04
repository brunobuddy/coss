import { Stack, useLocalSearchParams } from "expo-router";
import { Tags } from "lucide-react-native";
import { StatusDot } from "../../../../../../../../components/badge";
import { EmptyState } from "../../../../../../../../components/empty";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { ListRow, Panel, Ruled } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { useHookEventTypes } from "../../../../../../../../lib/queries";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

export default function HookEventTypesScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useHookEventTypes(params);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  return (
    <Screen onRefresh={() => query.refetch()} title="Event types">
      <WebButton path={`${environmentPath(params)}/hooks/event-types`} />
      <PageIntro
        description="The kinds of messages you send. Your applications' users pick the ones their endpoints receive."
        meta={<ModeBadge params={params} />}
        title="Event types"
      />
      <Panel>
        {query.data.data.length === 0 ? (
          <EmptyState
            description="Messages can use any type, but registered ones are what users subscribe to."
            icon={Tags}
            title="No event types yet"
          />
        ) : (
          <Ruled>
            {query.data.data.map((type) => (
              <ListRow
                key={type.name}
                subtitle={type.description ?? "—"}
                title={type.name}
                trailing={
                  <StatusDot
                    label={type.archived ? "Archived" : "Active"}
                    tone={type.archived ? "neutral" : "success"}
                  />
                }
              />
            ))}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}
