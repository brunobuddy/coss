import { useLocalSearchParams } from "expo-router";
import { Route } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import { EmptyState } from "../../../../../../../../components/empty";
import {
  Panel,
  PanelBody,
  Ruled,
  SpecItem,
  SpecList,
} from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatCount, formatDateTime } from "../../../../../../../../lib/format";
import { useSms } from "../../../../../../../../lib/queries";
import {
  SMS_EVENT_VARIANT,
  SMS_STATUS_LABELS,
  SMS_STATUS_TONE,
} from "../../../../../../../../lib/status";
import { space } from "../../../../../../../../lib/theme";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// The dashboard's sms/[smsId]/page.tsx.
export default function SmsDetailScreen() {
  const { id, ...params } = useLocalSearchParams<EnvironmentParams & { id: string }>();
  const query = useSms(params, id);

  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { sms, events } = query.data;

  return (
    <>
      <WebButton path={`${environmentPath(params)}/sms/${sms.id}`} />
      <Screen onRefresh={() => query.refetch()} title={sms.to}>
        <PageIntro
          description={`From ${sms.from}`}
          meta={
            <>
              <Badge variant="outline">
                <StatusDot
                  label={SMS_STATUS_LABELS[sms.status]}
                  tone={SMS_STATUS_TONE[sms.status]}
                />
              </Badge>
              {sms.sandbox ? (
                <Badge variant="info">sandbox</Badge>
              ) : (
                <Badge variant="outline">live</Badge>
              )}
            </>
          }
          mono
          title={sms.to}
        />
        <Panel>
          <SpecList>
            <SpecItem label="ID" mono>
              {sms.id}
            </SpecItem>
            <SpecItem label="Country" mono>
              {sms.country}
            </SpecItem>
            <SpecItem label="Segments" mono>
              {`${formatCount(sms.segments)} (${sms.encoding === "gsm7" ? "GSM-7" : "Unicode"})`}
            </SpecItem>
            <SpecItem label="Created" mono>
              {formatDateTime(sms.created_at)}
            </SpecItem>
            {sms.scheduled_at ? (
              <SpecItem label="Scheduled for" mono>
                {formatDateTime(sms.scheduled_at)}
              </SpecItem>
            ) : null}
            <SpecItem label="Sent" mono>
              {formatDateTime(sms.sent_at)}
            </SpecItem>
            <SpecItem label="Delivered" mono>
              {formatDateTime(sms.delivered_at)}
            </SpecItem>
            {sms.failure ? (
              <SpecItem label="Failure" mono stacked>
                {`${sms.failure.code}: ${sms.failure.message}`}
              </SpecItem>
            ) : null}
            {sms.tags.length > 0 ? (
              <SpecItem label="Tags" mono stacked>
                {sms.tags.map((tag) => `${tag.name}=${tag.value}`).join(", ")}
              </SpecItem>
            ) : null}
          </SpecList>
        </Panel>
        <Panel title="Text">
          <PanelBody>
            <Text selectable variant="body">
              {sms.body}
            </Text>
          </PanelBody>
        </Panel>
        <Panel title="Events">
          {events.length === 0 ? (
            <EmptyState
              tone="sms"
              description="Delivery events from the carrier appear here as they arrive."
              icon={Route}
              title="No events yet"
            />
          ) : (
            <Ruled>
              {events.map((event) => (
                <View key={event.id} style={styles.event}>
                  <View style={styles.eventHead}>
                    <Badge mono variant={SMS_EVENT_VARIANT[event.type]}>
                      {event.type.replace(/^sms\./, "")}
                    </Badge>
                    <Text muted variant="mono">
                      {formatDateTime(event.occurred_at)}
                    </Text>
                  </View>
                  {event.detail ? (
                    <Text muted selectable variant="mono">
                      {event.detail}
                    </Text>
                  ) : null}
                </View>
              ))}
            </Ruled>
          )}
        </Panel>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  event: { gap: 6, paddingHorizontal: space.lg, paddingVertical: space.md },
  eventHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: space.md,
    rowGap: space.xs,
  },
});
