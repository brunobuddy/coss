import type { RiskAssessmentSummary, RiskOutcome } from "@coss/companion";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { ShieldAlert, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { Alert as NativeAlert, StyleSheet, View } from "react-native";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import { Button } from "../../../../../../../../components/button";
import { type Filter, FilterChips } from "../../../../../../../../components/filters";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../../lib/format";
import {
  ApiRequestError,
  useResolveReview,
  useRiskAssessments,
} from "../../../../../../../../lib/queries";
import { DECISION_TONE } from "../../../../../../../../lib/status";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

type View_ = "review" | "block" | "allow";

// The dashboard's views (risk/page.tsx).
const VIEWS: Filter<View_>[] = [
  { value: null, label: "All" },
  { value: "review", label: "Review queue", tone: "warning" },
  { value: "block", label: "Blocked", tone: "error" },
  { value: "allow", label: "Allowed", tone: "success" },
];

export default function RiskScreen() {
  const { view: initialView, ...params } = useLocalSearchParams<
    EnvironmentParams & { view?: string }
  >();
  const [view, setView] = useState<View_ | null>(
    VIEWS.find((item) => item.value === initialView)?.value ?? null,
  );
  const query = useRiskAssessments(params, view ?? "all");
  const resolve = useResolveReview(params);
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const resolving = view === "review" && (query.data?.pages[0]?.can_review ?? false);
  return (
    <Screen onRefresh={() => query.refetch()} title="Risk">
      <WebButton path={`${environmentPath(params)}/risk`} />
      <PageIntro
        description="Every assessment of sign-ups, logins and other events made with this environment's API keys: the decision, its score and the reasons behind it. Reviews stay open until you report an outcome."
        meta={<ModeBadge params={params} />}
        title="Risk assessments"
      />
      <FilterChips items={VIEWS} onChange={setView} value={view} />
      <PagedPanel
        empty={{
          icon: view === "review" ? ShieldCheck : ShieldAlert,
          title: view === "review" ? "Nothing to review" : "No assessments yet",
          description:
            view === "review"
              ? "Assessments marked for review show up here until you report an outcome."
              : "Call coss.risk.assess() from your sign-up or login flow.",
        }}
        items={items}
        query={query}
        render={(assessment) => {
          const row = (
            <ListRow
              detail={formatAgo(assessment.created_at)}
              href={{
                pathname: "/[org]/projects/[project]/[env]/risk/[id]",
                params: { ...params, id: assessment.id },
              }}
              key={assessment.id}
              leading={<StatusDot tone={DECISION_TONE[assessment.decision] ?? "neutral"} />}
              subtitle={
                assessment.user.email ?? assessment.user.id ?? assessment.reason_codes.join(", ")
              }
              title={assessment.event_name ?? assessment.event}
              trailing={
                <View style={styles.badges}>
                  {assessment.review_status === "open" ? (
                    <Badge variant="warning">review</Badge>
                  ) : null}
                  <Badge mono variant="secondary">
                    {assessment.score.toFixed(2)}
                  </Badge>
                </View>
              }
            />
          );
          if (!resolving) return row;
          return (
            <View key={assessment.id}>
              {row}
              <ResolveButtons
                assessment={assessment}
                onResolve={(outcome) =>
                  resolve.mutate(
                    { id: assessment.id, outcome },
                    {
                      onSuccess: () =>
                        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
                      onError: (error) =>
                        NativeAlert.alert(
                          "Couldn't report the outcome",
                          error instanceof ApiRequestError ? error.message : "Try again.",
                        ),
                    },
                  )
                }
                pending={
                  resolve.isPending && resolve.variables?.id === assessment.id
                    ? resolve.variables.outcome
                    : null
                }
              />
            </View>
          );
        }}
      />
    </Screen>
  );
}

// The dashboard's ResolveButtons (risk/resolve-buttons.tsx): one tap, like the queue on the web;
// fraud asks first, since it is remembered against the user's identifiers.
function ResolveButtons(props: {
  assessment: RiskAssessmentSummary;
  /** The outcome being reported for this assessment. */
  pending: RiskOutcome | null;
  onResolve: (outcome: RiskOutcome) => void;
}) {
  return (
    <View style={styles.resolve}>
      <Button
        disabled={props.pending !== null}
        loading={props.pending === "legitimate"}
        onPress={() => props.onResolve("legitimate")}
        size="sm"
        title="Approve"
        variant="outline"
      />
      <Button
        disabled={props.pending !== null}
        loading={props.pending === "fraud"}
        onPress={() =>
          NativeAlert.alert("Report as fraud?", undefined, [
            { text: "Cancel", style: "cancel" },
            { text: "Fraud", style: "destructive", onPress: () => props.onResolve("fraud") },
          ])
        }
        size="sm"
        title="Fraud"
        variant="destructive-outline"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", gap: 6 },
  resolve: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
});
