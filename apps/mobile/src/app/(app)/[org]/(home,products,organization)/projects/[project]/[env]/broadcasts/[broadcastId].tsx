import type { BroadcastResponse } from "@coss/companion";
import * as Haptics from "expo-haptics";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { Ban, ExternalLink, FileText, Pause, Play } from "lucide-react-native";
import { Alert as NativeAlert, Pressable, StyleSheet, View } from "react-native";
import { Alert } from "../../../../../../../../components/alert";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import { Button } from "../../../../../../../../components/button";
import { EmptyState } from "../../../../../../../../components/empty";
import { Icon } from "../../../../../../../../components/icon";
import {
  ListRow,
  Panel,
  PanelBody,
  Ruled,
  SpecItem,
  SpecList,
} from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Stat, StatGrid } from "../../../../../../../../components/stat";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatCount, formatDateTime, formatPercent } from "../../../../../../../../lib/format";
import { ApiRequestError } from "../../../../../../../../lib/queries";
import {
  type BroadcastChange,
  useBroadcast,
  useChangeBroadcast,
} from "../../../../../../../../lib/queries-broadcasts";
import { EMAIL_STATUS_VARIANT } from "../../../../../../../../lib/status";
import {
  BROADCAST_STATUS_LABELS,
  BROADCAST_STATUS_TONE,
  pauseReasonText,
} from "../../../../../../../../lib/status-broadcasts";
import {
  type EnvironmentParams,
  environmentPath,
  openOnWeb,
} from "../../../../../../../../lib/web";

type Broadcast = BroadcastResponse["broadcast"];

function rateOf(count: number, of: number): string {
  return of > 0 ? formatPercent(count / of) : "—";
}

// The confirmations. Cancel's copy is the dashboard's CancelBroadcastButton
// (broadcasts/broadcast-controls.tsx); pause and resume are one click there.
const CONFIRM: Record<
  BroadcastChange,
  { title: (name: string) => string; message?: string; keep: string; action: string }
> = {
  pause: {
    title: (name) => `Pause “${name}”?`,
    message: "Unsent emails wait until you resume it.",
    keep: "Keep sending",
    action: "Pause",
  },
  resume: {
    title: (name) => `Resume “${name}”?`,
    message: "It continues where it stopped.",
    keep: "Not now",
    action: "Resume",
  },
  cancel: {
    title: (name) => `Cancel “${name}”?`,
    message:
      "It stops for good: emails not yet handed to the provider are dropped. Emails already on their way still arrive.",
    keep: "Keep sending",
    action: "Cancel broadcast",
  },
};

const FAILED: Record<BroadcastChange, string> = {
  pause: "Couldn't pause the broadcast",
  resume: "Couldn't resume the broadcast",
  cancel: "Couldn't cancel the broadcast",
};

// The dashboard's BroadcastChangeButton and CancelBroadcastButton, for `broadcast:send`.
function Controls(props: { params: EnvironmentParams; broadcast: Broadcast }) {
  const { broadcast } = props;
  const change = useChangeBroadcast(props.params, broadcast.id);
  const confirm = (kind: BroadcastChange) => {
    const copy = CONFIRM[kind];
    NativeAlert.alert(copy.title(broadcast.name), copy.message, [
      { text: copy.keep, style: "cancel" },
      {
        text: copy.action,
        style: kind === "cancel" ? "destructive" : "default",
        onPress: () =>
          change.mutate(kind, {
            onSuccess: () =>
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
            onError: (error) =>
              NativeAlert.alert(
                FAILED[kind],
                error instanceof ApiRequestError ? error.message : "Try again.",
              ),
          }),
      },
    ]);
  };
  const pending = (kind: BroadcastChange) => change.isPending && change.variables === kind;
  const { status } = broadcast;
  const buttons = [
    status === "scheduled" || status === "sending" ? (
      <View key="pause" style={styles.action}>
        <Button
          icon={Pause}
          loading={pending("pause")}
          onPress={() => confirm("pause")}
          title="Pause"
          variant="outline"
        />
      </View>
    ) : null,
    status === "paused" ? (
      <View key="resume" style={styles.action}>
        <Button
          icon={Play}
          loading={pending("resume")}
          onPress={() => confirm("resume")}
          title="Resume"
          variant="outline"
        />
      </View>
    ) : null,
    status === "scheduled" || status === "sending" || status === "paused" ? (
      <View key="cancel" style={[styles.action, styles.cancel]}>
        <Button
          icon={Ban}
          loading={pending("cancel")}
          onPress={() => confirm("cancel")}
          title="Cancel broadcast"
          variant="destructive-outline"
        />
      </View>
    ) : null,
  ].filter(Boolean);
  return buttons.length > 0 ? <View style={styles.actions}>{buttons}</View> : null;
}

function Stats({ broadcast }: { broadcast: Broadcast }) {
  const { stats, tracking } = broadcast;
  return (
    <StatGrid>
      <Stat
        detail={
          broadcast.recipients_estimated === null
            ? undefined
            : `of ~${formatCount(broadcast.recipients_estimated)}`
        }
        key="recipients"
        label="Recipients"
        value={formatCount(stats.recipients)}
      />
      <Stat
        detail={`${rateOf(stats.delivered, stats.sent)} of sent`}
        key="delivered"
        label="Delivered"
        value={formatCount(stats.delivered)}
      />
      <Stat
        detail={tracking.opens ? "unique" : "tracking off"}
        key="opened"
        label="Opened"
        value={tracking.opens ? rateOf(stats.opened, stats.delivered) : "—"}
      />
      <Stat
        detail={tracking.clicks ? "unique" : "tracking off"}
        key="clicked"
        label="Clicked"
        value={tracking.clicks ? rateOf(stats.clicked, stats.delivered) : "—"}
      />
      <Stat
        detail={rateOf(stats.bounced, stats.sent)}
        key="bounced"
        label="Bounced"
        value={formatCount(stats.bounced)}
      />
      <Stat
        detail={rateOf(stats.complained, stats.delivered)}
        key="complaints"
        label="Complaints"
        value={formatCount(stats.complained)}
      />
      <Stat
        detail={rateOf(stats.unsubscribed, stats.delivered)}
        key="unsubscribed"
        label="Unsubscribed"
        value={formatCount(stats.unsubscribed)}
      />
      <Stat key="failed" label="Failed" value={formatCount(stats.failed)} />
    </StatGrid>
  );
}

function Preview(props: { broadcast: Broadcast; onOpenWeb: () => void }) {
  const { broadcast } = props;
  const title = `Preview: ${broadcast.preview_subject}`;
  if (broadcast.preview_text_body !== null) {
    return (
      <Panel
        action={
          broadcast.has_html ? (
            <Pressable
              accessibilityLabel="Preview on coss.com"
              hitSlop={8}
              onPress={props.onOpenWeb}
            >
              <Icon color="mutedForeground" icon={ExternalLink} />
            </Pressable>
          ) : undefined
        }
        title={title}
      >
        <PanelBody>
          <Text selectable variant="body">
            {broadcast.preview_text_body}
          </Text>
        </PanelBody>
      </Panel>
    );
  }
  return (
    <Panel title={title}>
      <EmptyState
        action={
          broadcast.has_html ? (
            <Button
              icon={ExternalLink}
              onPress={props.onOpenWeb}
              size="sm"
              title="Preview on coss.com"
              variant="outline"
            />
          ) : undefined
        }
        description={
          broadcast.has_html
            ? "This broadcast has an HTML body only. The preview stays on coss.com, where it is sandboxed."
            : "This broadcast has no body."
        }
        icon={FileText}
        title={broadcast.has_html ? "HTML only" : "No content"}
      />
    </Panel>
  );
}

// The dashboard's broadcasts/[broadcastId]/page.tsx (copy from there). Drafts are edited, tested
// and sent on coss.com.
export default function BroadcastScreen() {
  const { broadcastId, ...params } = useLocalSearchParams<
    EnvironmentParams & { broadcastId: string }
  >();
  const query = useBroadcast(params, broadcastId);

  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { broadcast, recent_emails, can_send, can_read_email } = query.data;
  const base = environmentPath(params);
  const webPath = `${base}/broadcasts/${broadcast.id}`;
  const draft = broadcast.status === "draft";

  return (
    <>
      <WebButton path={webPath} />
      <Screen onRefresh={() => query.refetch()} title={broadcast.name}>
        <PageIntro
          description={
            broadcast.status === "scheduled" && broadcast.scheduled_at
              ? `Starts ${formatDateTime(broadcast.scheduled_at)}`
              : `Updated ${formatDateTime(broadcast.updated_at)}`
          }
          meta={
            <Badge variant="outline">
              <StatusDot
                label={BROADCAST_STATUS_LABELS[broadcast.status]}
                tone={BROADCAST_STATUS_TONE[broadcast.status]}
              />
            </Badge>
          }
          title={broadcast.name}
        />
        {can_send ? <Controls broadcast={broadcast} params={params} /> : null}

        {broadcast.status === "paused" && broadcast.pause_reason ? (
          <Alert
            description={pauseReasonText(broadcast.pause_reason)}
            title="Paused"
            tone="warning"
          />
        ) : null}
        {broadcast.status === "sending" && broadcast.pause_reason ? (
          <Alert
            description={pauseReasonText(broadcast.pause_reason)}
            title="Waiting"
            tone="warning"
          />
        ) : null}
        {broadcast.error ? (
          <Alert description={broadcast.error.message} title="Failed" tone="error" />
        ) : null}
        {broadcast.mailing_address_missing ? (
          <Alert
            action={{
              label: "Marketing settings",
              onPress: () => router.push(`${base}/marketing` as Href),
            }}
            description="Broadcasts can't be sent until the marketing settings have your postal address (CAN-SPAM)."
            title="No postal address"
            tone="warning"
          />
        ) : null}
        {draft ? (
          <Alert
            action={{ label: "Open on coss.com", onPress: () => openOnWeb(webPath) }}
            description="Drafts are edited, tested and sent on coss.com."
            tone="neutral"
          />
        ) : (
          <Stats broadcast={broadcast} />
        )}

        <Panel title="Details">
          <SpecList>
            <SpecItem label="Send to">
              {broadcast.target ? `${broadcast.target.name} (${broadcast.target.type})` : "—"}
            </SpecItem>
            <SpecItem label="Topic">{broadcast.topic ?? "—"}</SpecItem>
            <SpecItem label="From" mono>
              {broadcast.from}
            </SpecItem>
            {broadcast.reply_to.length > 0 ? (
              <SpecItem label="Reply to" mono>
                {broadcast.reply_to.join(", ")}
              </SpecItem>
            ) : null}
            {draft ? (
              <SpecItem label="Reach now" mono>
                {broadcast.reach_estimate === null
                  ? "—"
                  : `~${formatCount(broadcast.reach_estimate)} contacts`}
              </SpecItem>
            ) : null}
            <SpecItem label="Scheduled" mono>
              {formatDateTime(broadcast.scheduled_at)}
            </SpecItem>
            <SpecItem label="Started" mono>
              {formatDateTime(broadcast.started_at)}
            </SpecItem>
            <SpecItem label="Finished" mono>
              {formatDateTime(broadcast.finished_at)}
            </SpecItem>
            <SpecItem label="Rate" mono>
              {`${broadcast.rate_per_second} / s`}
            </SpecItem>
            <SpecItem label="Track opens">{broadcast.tracking.opens ? "On" : "Off"}</SpecItem>
            <SpecItem label="Track clicks">{broadcast.tracking.clicks ? "On" : "Off"}</SpecItem>
            {broadcast.preview_text ? (
              <SpecItem label="Preview text" stacked>
                {broadcast.preview_text}
              </SpecItem>
            ) : null}
          </SpecList>
        </Panel>

        <Preview broadcast={broadcast} onOpenWeb={() => openOnWeb(webPath)} />

        {recent_emails.length > 0 ? (
          <Panel title="Recent emails">
            <Ruled>
              {recent_emails.map((email) => (
                <ListRow
                  href={
                    can_read_email
                      ? {
                          pathname: "/[org]/projects/[project]/[env]/emails/[id]",
                          params: { ...params, id: email.id },
                        }
                      : undefined
                  }
                  key={email.id}
                  subtitle={formatDateTime(email.created_at)}
                  title={email.to}
                  trailing={
                    <Badge variant={EMAIL_STATUS_VARIANT[email.status]}>{email.status}</Badge>
                  }
                />
              ))}
            </Ruled>
          </Panel>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { flexGrow: 1, flexBasis: "45%" },
  // "Cancel broadcast" doesn't fit half a row beside Pause or Resume.
  cancel: { flexBasis: "100%" },
});
