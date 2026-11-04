import { Stack, useLocalSearchParams } from "expo-router";
import { Send } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge, StatusDot } from "../../../../../../../../../../components/badge";
import { CodeBlock } from "../../../../../../../../../../components/code-block";
import { EmptyState } from "../../../../../../../../../../components/empty";
import { Panel, Ruled } from "../../../../../../../../../../components/panel";
import {
  ErrorState,
  Loading,
  PageIntro,
  Screen,
} from "../../../../../../../../../../components/screen";
import { Text } from "../../../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../../../components/web-button";
import { formatDateTime } from "../../../../../../../../../../lib/format";
import { useHookMessage } from "../../../../../../../../../../lib/queries";
import { HOOK_DELIVERY_STATUS } from "../../../../../../../../../../lib/status";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../../../lib/web";

export default function HookMessageScreen() {
  const { applicationId, messageId, ...params } = useLocalSearchParams<
    EnvironmentParams & { applicationId: string; messageId: string }
  >();
  const query = useHookMessage(params, applicationId, messageId);
  if (query.isPending) return <Loading />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const { application, message, deliveries } = query.data;
  return (
    <Screen onRefresh={() => query.refetch()}>
      <Stack.Screen
        options={{
          title: "Message",
          headerRight: () => (
            <WebButton
              path={`${environmentPath(params)}/hooks/${application.id}/messages/${message.id}`}
            />
          ),
        }}
      />
      <PageIntro
        description={`Sent to ${application.name} ${formatDateTime(message.created_at)}.`}
        meta={
          <Text muted selectable variant="mono">
            {message.id}
          </Text>
        }
        mono
        title={message.event_type}
      />
      <Panel description="The JSON body delivered to each endpoint." title="Payload">
        <CodeBlock>{JSON.stringify(message.payload, null, 2)}</CodeBlock>
      </Panel>
      <Panel
        description="One per endpoint the message went to, with every attempt."
        title="Deliveries"
      >
        {deliveries.length === 0 ? (
          <EmptyState
            description={`No endpoint of this application was subscribed to ${message.event_type}.`}
            icon={Send}
            title="Not delivered anywhere"
          />
        ) : (
          <Ruled>
            {deliveries.map((delivery) => {
              const [tone, label] = HOOK_DELIVERY_STATUS[delivery.status] ?? [
                "neutral",
                delivery.status,
              ];
              return (
                <View key={delivery.id} style={styles.delivery}>
                  <View style={styles.head}>
                    <StatusDot label={label} tone={tone} />
                    <Text muted numberOfLines={1} style={styles.url} variant="mono">
                      {delivery.endpoint_url ?? delivery.endpoint_id}
                    </Text>
                  </View>
                  {delivery.attempts.length === 0 && delivery.last_error ? (
                    <Text muted variant="small">
                      {delivery.last_error}
                    </Text>
                  ) : null}
                  {delivery.attempts.map((attempt) => (
                    <View key={attempt.id} style={styles.attempt}>
                      <View style={styles.head}>
                        <Badge
                          mono
                          variant={
                            attempt.status_code && attempt.status_code < 300 ? "success" : "error"
                          }
                        >
                          {attempt.status_code ? `HTTP ${attempt.status_code}` : "error"}
                        </Badge>
                        <Text muted variant="mono">
                          {formatDateTime(attempt.attempted_at)} · {attempt.duration_ms} ms
                        </Text>
                      </View>
                      {attempt.error ? <Text variant="small">{attempt.error}</Text> : null}
                      {attempt.response_excerpt ? (
                        <Text muted numberOfLines={4} selectable variant="mono">
                          {attempt.response_excerpt}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              );
            })}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  delivery: { gap: 10, padding: 16 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  url: { flex: 1 },
  attempt: { gap: 4, paddingLeft: 14 },
});
