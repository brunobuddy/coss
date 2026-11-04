import type { MobileSegmentCondition } from "@coss/companion";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Panel, PanelBody, Ruled } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Code, Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatCount, formatDateTime } from "../../../../../../../../lib/format";
import { useSegment } from "../../../../../../../../lib/queries-contacts";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from the dashboard's segments/[segmentId]/page.tsx and segment-builder.tsx (the builder's
// words, written out; its "Preview matches" answer is shown right away).
function Condition({ condition }: { condition: MobileSegmentCondition }) {
  return (
    <Text variant="body">
      <Text muted variant="body">
        {condition.field}
      </Text>{" "}
      {condition.key ? (
        <>
          <Code>{condition.key}</Code>{" "}
        </>
      ) : null}
      {condition.operator}
      {condition.value !== null ? ` ${condition.value}` : ""}
    </Text>
  );
}

export default function SegmentScreen() {
  const { segmentId, ...params } = useLocalSearchParams<
    EnvironmentParams & { segmentId: string }
  >();
  const query = useSegment(params, segmentId);

  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { segment, count, sample } = query.data;

  return (
    <>
      <WebButton path={`${environmentPath(params)}/segments/${segment.id}`} />
      <Screen onRefresh={() => query.refetch()} title={segment.name}>
        <PageIntro
          description={`Updated ${formatDateTime(segment.updated_at)}.`}
          title={segment.name}
        />
        <Panel description={`Contacts matching ${segment.match} of these conditions:`}>
          <Ruled>
            {segment.conditions.map((item, index) =>
              item.kind === "condition" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no ids and never reorder.
                <View key={index} style={styles.row}>
                  <Condition condition={item.condition} />
                </View>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no ids and never reorder.
                <View key={index} style={styles.row}>
                  <Text muted variant="small">
                    {`Matching ${item.match} of:`}
                  </Text>
                  <View style={styles.group}>
                    {item.conditions.map((condition, inner) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: as above.
                      <Condition condition={condition} key={inner} />
                    ))}
                  </View>
                </View>
              ),
            )}
          </Ruled>
        </Panel>
        {count !== null ? (
          <Panel title="Matches">
            <PanelBody>
              <Text muted variant="small">
                {`${formatCount(count)} ${count === 1 ? "contact matches" : "contacts match"} now${
                  sample.length > 0 ? `, e.g. ${sample.join(", ")}` : ""
                }. Broadcasts reach only the subscribed ones.`}
              </Text>
            </PanelBody>
          </Panel>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  group: { gap: 6, paddingLeft: 12 },
});
