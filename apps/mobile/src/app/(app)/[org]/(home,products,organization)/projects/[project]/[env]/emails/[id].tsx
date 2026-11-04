import type { EmailResponse } from "@coss/companion";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { type Href, Link, Stack, useLocalSearchParams } from "expo-router";
import {
  Ban,
  CalendarClock,
  ExternalLink,
  FileText,
  Paperclip,
  Route,
  Users,
} from "lucide-react-native";
import { useState } from "react";
import { Modal, Alert as NativeAlert, Pressable, StyleSheet, View } from "react-native";
import { Badge } from "../../../../../../../../components/badge";
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
import { Tabs } from "../../../../../../../../components/tabs";
import { Text } from "../../../../../../../../components/text";
import { formatBytes, formatCount, formatDateTime } from "../../../../../../../../lib/format";
import {
  ApiRequestError,
  useCancelEmail,
  useEmail,
  useOrganization,
  useRescheduleEmail,
} from "../../../../../../../../lib/queries";
import {
  EMAIL_STATUS_VARIANT,
  EVENT_VARIANT,
  RECIPIENT_STATUS_VARIANT,
} from "../../../../../../../../lib/status";
import { colors, space, usePalette } from "../../../../../../../../lib/theme";
import { openOnWeb } from "../../../../../../../../lib/web";

type Tab = "overview" | "events" | "recipients" | "content" | "attachments";

function list(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        accessibilityLabel="Copy email ID"
        icon={copied ? "checkmark" : "doc.on.doc"}
        onPress={async () => {
          await Clipboard.setStringAsync(id);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      />
    </Stack.Toolbar>
  );
}

function Overview({
  email,
  params,
}: {
  email: EmailResponse["email"];
  params: { org: string; project: string; env: string };
}) {
  const organization = useOrganization(params.org);
  const template = email.template;
  const templateLabel = template
    ? `${template.version === null ? "Draft (test send)" : `Version ${template.version}`} · ${template.locale}`
    : "";
  // The dashboard links the template (a version, or the template itself for a draft test send).
  const templateHref =
    template &&
    (`/${params.org}/projects/${params.project}/${params.env}/templates/${template.id}${
      template.version === null ? "" : `/versions/${template.version}`
    }` as Href);
  return (
    <>
      <Panel title="Envelope">
        <SpecList>
          <SpecItem label="From">{email.from}</SpecItem>
          <SpecItem label="To">{list(email.to)}</SpecItem>
          {email.cc.length > 0 ? <SpecItem label="Cc">{list(email.cc)}</SpecItem> : null}
          {email.bcc.length > 0 ? <SpecItem label="Bcc">{list(email.bcc)}</SpecItem> : null}
          {email.reply_to.length > 0 ? (
            <SpecItem label="Reply to">{list(email.reply_to)}</SpecItem>
          ) : null}
          <SpecItem label="Created" mono>
            {formatDateTime(email.created_at)}
          </SpecItem>
          {email.scheduled_at ? (
            <SpecItem label="Scheduled" mono>
              {formatDateTime(email.scheduled_at)}
            </SpecItem>
          ) : null}
          <SpecItem label="Sent" mono>
            {formatDateTime(email.sent_at)}
          </SpecItem>
          <SpecItem label="Category" mono>
            {email.category ?? "—"}
          </SpecItem>
          {email.content_storage === "discard" ? (
            <SpecItem label="Content" mono>
              {email.content_discarded_at
                ? `Discarded ${formatDateTime(email.content_discarded_at)}`
                : "Discarded once sent"}
            </SpecItem>
          ) : null}
          {templateHref ? (
            <SpecItem label="Template" mono>
              {organization.data?.can.read_template ? (
                <Link href={templateHref}>
                  <Text style={styles.link} variant="mono">
                    {templateLabel}
                  </Text>
                </Link>
              ) : (
                templateLabel
              )}
            </SpecItem>
          ) : null}
        </SpecList>
      </Panel>
      <Panel title="Engagement">
        <SpecList>
          <SpecItem label="Opens" mono>
            {email.tracking.opens ? formatCount(email.tracking.open_count) : "tracking off"}
          </SpecItem>
          <SpecItem label="Clicks" mono>
            {email.tracking.clicks ? formatCount(email.tracking.click_count) : "tracking off"}
          </SpecItem>
        </SpecList>
      </Panel>
    </>
  );
}

// The dashboard's CancelEmailButton (emails/[emailId]/cancel-email-button.tsx).
function CancelEmail(props: { params: { org: string; project: string; env: string }; id: string }) {
  const cancel = useCancelEmail(props.params, props.id);
  return (
    <Button
      icon={Ban}
      loading={cancel.isPending}
      onPress={() =>
        NativeAlert.alert(
          "Cancel this scheduled email?",
          "It will not be sent. To send it at another time, reschedule it instead.",
          [
            { text: "Keep scheduled", style: "cancel" },
            {
              text: "Cancel email",
              style: "destructive",
              onPress: () =>
                cancel.mutate(undefined, {
                  onSuccess: () =>
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
                  onError: (error) =>
                    NativeAlert.alert(
                      "Couldn't cancel the email",
                      error instanceof ApiRequestError ? error.message : "Try again.",
                    ),
                }),
            },
          ],
        )
      }
      title="Cancel email"
      variant="destructive-outline"
    />
  );
}

const MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

// The dashboard's RescheduleEmailDialog (emails/[emailId]/reschedule-email-dialog.tsx), in the
// device's time zone like every time in the app (the dashboard shows UTC).
function RescheduleEmail(props: {
  params: { org: string; project: string; env: string };
  id: string;
  scheduledAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(() => new Date(props.scheduledAt));
  const reschedule = useRescheduleEmail(props.params, props.id);
  const palette = usePalette();
  const now = Date.now();
  const close = () => {
    setOpen(false);
    reschedule.reset();
  };
  return (
    <>
      <Button
        icon={CalendarClock}
        onPress={() => {
          setWhen(new Date(props.scheduledAt));
          setOpen(true);
        }}
        title="Reschedule"
        variant="outline"
      />
      <Modal
        animationType="slide"
        onRequestClose={close}
        presentationStyle="pageSheet"
        visible={open}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetText}>
            <Text variant="heading">Reschedule this email</Text>
            <Text muted variant="small">
              Choose when to send it instead, at most 30 days from now. The domain and the
              suppression list are still checked when it is sent.
            </Text>
          </View>
          <DateTimePicker
            accentColor={palette.foreground}
            display="inline"
            maximumDate={new Date(now + MAX_AHEAD_MS)}
            minimumDate={new Date(now)}
            mode="datetime"
            onValueChange={(_event, date) => setWhen(date)}
            value={when}
          />
          {reschedule.error ? (
            <Text style={styles.error} variant="small">
              {reschedule.error instanceof ApiRequestError
                ? reschedule.error.message
                : "Try again."}
            </Text>
          ) : null}
          <View style={styles.sheetActions}>
            <View style={styles.sheetAction}>
              <Button onPress={close} title="Cancel" variant="outline" />
            </View>
            <View style={styles.sheetAction}>
              <Button
                loading={reschedule.isPending}
                onPress={() =>
                  reschedule.mutate(when.toISOString(), {
                    onSuccess: ({ scheduled_at }) => {
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      close();
                      NativeAlert.alert(
                        "Email rescheduled",
                        `It will be sent at ${formatDateTime(scheduled_at)}.`,
                      );
                    },
                  })
                }
                title="Reschedule"
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function EmailScreen() {
  const { id, ...params } = useLocalSearchParams<{
    org: string;
    project: string;
    env: string;
    id: string;
  }>();
  const query = useEmail(params, id);
  const [tab, setTab] = useState<Tab>("overview");

  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { email, events, has_more_events, can_send } = query.data;
  const openEmailOnWeb = () =>
    openOnWeb(`/${params.org}/projects/${params.project}/${params.env}/emails/${email.id}`);

  return (
    <>
      <CopyId id={email.id} />
      <Screen onRefresh={() => query.refetch()}>
        <PageIntro
          meta={
            <>
              <Badge variant={EMAIL_STATUS_VARIANT[email.status]}>{email.status}</Badge>
              {email.sandbox ? (
                <Badge variant="info">sandbox</Badge>
              ) : (
                <Badge variant="outline">live</Badge>
              )}
              <Text muted numberOfLines={1} selectable style={styles.id} variant="mono">
                {email.id}
              </Text>
            </>
          }
          title={
            email.content_discarded_at ? "Content not stored" : email.subject || "(no subject)"
          }
        />
        {email.status === "scheduled" && can_send ? (
          <View style={styles.actions}>
            <View style={styles.action}>
              <RescheduleEmail
                id={email.id}
                params={params}
                scheduledAt={email.scheduled_at ?? new Date().toISOString()}
              />
            </View>
            <View style={styles.action}>
              <CancelEmail id={email.id} params={params} />
            </View>
          </View>
        ) : null}
        <Tabs
          items={[
            { value: "overview", label: "Overview" },
            {
              value: "events",
              label: "Events",
              count: has_more_events ? `${events.length}+` : events.length,
            },
            { value: "recipients", label: "Recipients", count: email.recipients.length },
            { value: "content", label: "Content" },
            ...(email.attachments.length > 0
              ? [
                  {
                    value: "attachments" as const,
                    label: "Attachments",
                    count: email.attachments.length,
                  },
                ]
              : []),
          ]}
          onChange={setTab}
          value={tab}
        />
        {tab === "overview" ? <Overview email={email} params={params} /> : null}
        {tab === "events" ? (
          <Panel footer={has_more_events ? "Older events are on coss.com." : undefined}>
            {events.length === 0 ? (
              <EmptyState
                tone="email"
                description="Delivery events from the provider appear here as they arrive."
                icon={Route}
                title="No events yet"
              />
            ) : (
              <Ruled>
                {events.map((event) => (
                  <View key={event.id} style={styles.event}>
                    <View style={styles.eventHead}>
                      <Badge mono variant={EVENT_VARIANT[event.type]}>
                        {event.type}
                      </Badge>
                      <Text muted variant="mono">
                        {formatDateTime(event.occurred_at)}
                      </Text>
                    </View>
                    {event.recipient ? <Text variant="small">{event.recipient}</Text> : null}
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
        ) : null}
        {tab === "recipients" ? (
          <Panel>
            {email.recipients.length === 0 ? (
              <EmptyState tone="email" icon={Users} title="No recipients" />
            ) : (
              <Ruled>
                {email.recipients.map((recipient) => (
                  <ListRow
                    key={`${recipient.type}:${recipient.address}`}
                    subtitle={`${recipient.type} · ${formatDateTime(recipient.last_event_at)}`}
                    title={recipient.address}
                    trailing={
                      <Badge variant={RECIPIENT_STATUS_VARIANT[recipient.status]}>
                        {recipient.status.replaceAll("_", " ")}
                      </Badge>
                    }
                  />
                ))}
              </Ruled>
            )}
          </Panel>
        ) : null}
        {tab === "content" ? (
          email.content_discarded_at ? (
            <Panel title="Content">
              <EmptyState
                tone="email"
                description="This environment's content storage was off when the email was sent: its subject, body, headers and attachment names were discarded once it left the queue."
                icon={FileText}
                title="No content stored"
              />
            </Panel>
          ) : email.text !== null ? (
            <Panel
              action={
                email.has_html ? (
                  <Pressable hitSlop={8} onPress={openEmailOnWeb}>
                    <Icon color="mutedForeground" icon={ExternalLink} />
                  </Pressable>
                ) : undefined
              }
              title="Text"
            >
              <PanelBody>
                <Text selectable variant="body">
                  {email.text}
                </Text>
              </PanelBody>
            </Panel>
          ) : (
            <Panel title="Content">
              <EmptyState
                tone="email"
                action={
                  email.has_html ? (
                    <Button
                      icon={ExternalLink}
                      onPress={openEmailOnWeb}
                      size="sm"
                      title="Preview on coss.com"
                      variant="outline"
                    />
                  ) : undefined
                }
                description={
                  email.has_html
                    ? "This email has an HTML body only. The preview stays on coss.com, where it is sandboxed."
                    : "This email has no body."
                }
                icon={FileText}
                title={email.has_html ? "HTML only" : "No content"}
              />
            </Panel>
          )
        ) : null}
        {tab === "attachments" ? (
          <Panel footer="Contents are discarded once an email is sent.">
            <Ruled>
              {email.attachments.map((attachment) => (
                <ListRow
                  detail={formatBytes(attachment.size)}
                  key={attachment.id}
                  leading={<Icon color="mutedForeground" icon={Paperclip} />}
                  subtitle={attachment.content_type}
                  title={attachment.filename || "Name not stored"}
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
  link: { textDecorationLine: "underline" },
  actions: { flexDirection: "row", gap: space.sm },
  action: { flex: 1 },
  sheet: { flex: 1, gap: space.lg, padding: space.xl, backgroundColor: colors.background },
  sheetText: { gap: 6 },
  sheetActions: { flexDirection: "row", gap: space.sm },
  sheetAction: { flex: 1 },
  error: { color: colors.destructiveForeground },
  id: { flexShrink: 1 },
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
