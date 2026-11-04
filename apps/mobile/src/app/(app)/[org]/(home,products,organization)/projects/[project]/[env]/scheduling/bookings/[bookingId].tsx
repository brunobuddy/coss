import type { SchedulingBooking } from "@coss/companion";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { CalendarX, Copy, ExternalLink } from "lucide-react-native";
import { Alert as NativeAlert, StyleSheet, View } from "react-native";
import { Alert } from "../../../../../../../../../components/alert";
import { Avatar } from "../../../../../../../../../components/avatar";
import { Badge, StatusDot } from "../../../../../../../../../components/badge";
import { useNow } from "../../../../../../../../../components/booking-agenda";
import { Button } from "../../../../../../../../../components/button";
import { Icon } from "../../../../../../../../../components/icon";
import {
  ListRow,
  Panel,
  Ruled,
  SpecItem,
  SpecList,
} from "../../../../../../../../../components/panel";
import { ProductGlyph } from "../../../../../../../../../components/product-glyph";
import { Screen } from "../../../../../../../../../components/screen";
import { Text } from "../../../../../../../../../components/text";
import {
  formatDuration,
  formatShortDay,
  formatTime,
  formatUntil,
  localTimeZone,
  minutesBetween,
} from "../../../../../../../../../lib/format-scheduling";
import { useOrganization } from "../../../../../../../../../lib/queries";
import {
  type BookingAction,
  useBookingAction,
  useSchedulingBooking,
} from "../../../../../../../../../lib/queries-scheduling";
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TONE,
  LOCATION_ICONS,
  LOCATION_LABELS,
} from "../../../../../../../../../lib/status-scheduling";
import { colors, productColors, space } from "../../../../../../../../../lib/theme";
import type { EnvironmentParams } from "../../../../../../../../../lib/web";

const SCHEDULING = productColors("scheduling");

// The dashboard's confirmations (scheduling/scheduling-actions.tsx).
const CONFIRM: Partial<Record<BookingAction, { title: string; message: string; button: string }>> =
  {
    cancel: {
      title: "Cancel this booking?",
      message:
        "The time is freed, the calendar event removed and the attendee told. It stays charged.",
      button: "Cancel booking",
    },
    decline: {
      title: "Decline this booking?",
      message: "The time is freed and the attendee told. This can't be undone.",
      button: "Decline booking",
    },
  };

function Hero({ booking, now }: { booking: SchedulingBooking; now: Date }) {
  const start = new Date(booking.start);
  const expires = booking.approval_expires_at
    ? formatUntil(booking.approval_expires_at, now)
    : null;
  return (
    <View style={styles.hero}>
      <Text style={{ color: SCHEDULING.text }} variant="caps">
        {formatShortDay(start)}
      </Text>
      <Text variant="value">
        {formatTime(booking.start)} – {formatTime(booking.end)}
      </Text>
      <Text variant="heading">{booking.title}</Text>
      <View style={styles.heroMeta}>
        <Badge variant={BOOKING_STATUS_TONE[booking.status]}>
          {BOOKING_STATUS_LABELS[booking.status]}
        </Badge>
        <Text muted variant="mono">
          {formatDuration(minutesBetween(booking.start, booking.end))}
        </Text>
        {booking.status === "pending_approval" && expires ? (
          <Text style={{ color: colors.warningForeground }} variant="mono">
            expires {expires}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function BookingScreen() {
  const { bookingId, ...params } = useLocalSearchParams<
    EnvironmentParams & { bookingId: string }
  >();
  const now = useNow();
  const query = useSchedulingBooking(params, bookingId);
  const organization = useOrganization(params.org);
  const action = useBookingAction(params, bookingId);
  const sheet = <Stack.Screen options={{ title: "Booking" }} />;
  if (query.isPending) return <Screen loading="detail">{sheet}</Screen>;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const booking = query.data as SchedulingBooking;
  const canChange = organization.data?.can.update_scheduling ?? false;
  const ended = booking.status === "cancelled" || booking.status === "declined";

  const perform = (kind: BookingAction) => {
    const run = () =>
      action.mutate(kind, {
        onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        onError: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      });
    const confirm = CONFIRM[kind];
    if (!confirm) {
      run();
      return;
    }
    NativeAlert.alert(confirm.title, confirm.message, [
      { text: "Keep it", style: "cancel" },
      { text: confirm.button, style: "destructive", onPress: run },
    ]);
  };

  return (
    <Screen onRefresh={() => query.refetch()}>
      {sheet}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button onPress={() => router.back()}>Done</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Hero booking={booking} now={now} />
      {action.error ? <Alert description={action.error.message} tone="error" /> : null}
      {canChange && booking.status === "pending_approval" ? (
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              loading={action.isPending && action.variables === "approve"}
              onPress={() => perform("approve")}
              title="Approve"
            />
          </View>
          <View style={styles.action}>
            <Button
              disabled={action.isPending}
              onPress={() => perform("decline")}
              title="Decline"
              variant="outline"
            />
          </View>
        </View>
      ) : null}
      {booking.external_conflict_at && !ended ? (
        <Alert
          description="Something else was added to a host's calendar at this time. coss.com never cancels a booking on its own."
          title="Calendar conflict"
          tone="warning"
        />
      ) : null}
      {booking.calendar_unverified && !ended ? (
        <Alert
          description="A host's calendar couldn't be read when this was booked, so their last known times were used."
          title="Calendar not checked"
          tone="warning"
        />
      ) : null}
      <Panel title={booking.attendees.length === 1 ? "Attendee" : "Attendees"}>
        <Ruled>
          {booking.attendees.map((attendee, index) => (
            <ListRow
              detail={`${formatTime(booking.start, attendee.time_zone)} there`}
              key={attendee.uid ?? index}
              leading={<Avatar name={attendee.name ?? attendee.uid ?? "?"} />}
              subtitle={attendee.time_zone.replace(/_/g, " ")}
              title={attendee.name ?? attendee.uid ?? "Details removed"}
            />
          ))}
        </Ruled>
      </Panel>
      {booking.hosts.length > 0 ? (
        <Panel title={booking.hosts.length === 1 ? "Host" : "Hosts"}>
          <Ruled>
            {booking.hosts.map((host) => (
              <ListRow key={host.id} leading={<Avatar name={host.name} />} title={host.name} />
            ))}
          </Ruled>
        </Panel>
      ) : null}
      {booking.location ? (
        <Panel title="Where">
          <ListRow
            leading={
              <ProductGlyph
                icon={LOCATION_ICONS[booking.location.type]}
                size={32}
                tone="scheduling"
              />
            }
            onPress={
              booking.location.detail
                ? () => {
                    const detail = booking.location?.detail ?? "";
                    if (/^https:\/\//.test(detail)) void Linking.openURL(detail);
                    else void Clipboard.setStringAsync(detail);
                  }
                : undefined
            }
            subtitle={booking.location.detail ?? undefined}
            title={LOCATION_LABELS[booking.location.type]}
            trailing={
              booking.location.detail ? (
                <Icon
                  color="mutedForeground"
                  icon={/^https:\/\//.test(booking.location.detail) ? ExternalLink : Copy}
                  size={14}
                />
              ) : undefined
            }
          />
        </Panel>
      ) : null}
      <Panel>
        <SpecList>
          <SpecItem label="Times shown in">{localTimeZone().replace(/_/g, " ")}</SpecItem>
          {booking.series_index !== null ? (
            <SpecItem label="In its series">{`Occurrence ${booking.series_index + 1}`}</SpecItem>
          ) : null}
          {booking.no_show_at ? (
            <SpecItem label="Attendance">
              <StatusDot label="No-show" tone="neutral" />
            </SpecItem>
          ) : null}
          <SpecItem label="ID" mono>
            {booking.id}
          </SpecItem>
        </SpecList>
      </Panel>
      <Text muted style={styles.note} variant="small">
        Answers to booking questions are only available through the API.
      </Text>
      {canChange && !ended && booking.status !== "pending_approval" ? (
        <Button
          icon={CalendarX}
          loading={action.isPending && action.variables === "cancel"}
          onPress={() => perform("cancel")}
          title="Cancel booking"
          variant="destructive-outline"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.xs },
  heroMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.xs,
  },
  actions: { flexDirection: "row", gap: space.sm },
  action: { flex: 1 },
  note: { paddingHorizontal: space.xxs },
});
