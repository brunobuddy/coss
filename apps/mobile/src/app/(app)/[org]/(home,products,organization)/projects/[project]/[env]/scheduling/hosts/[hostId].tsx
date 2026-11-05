import type { SchedulingHostResponse } from "@coss/companion";
import { Stack, useLocalSearchParams } from "expo-router";
import { CalendarOff, CalendarSync } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../../../../../../../../components/alert";
import { Avatar } from "../../../../../../../../../components/avatar";
import { Badge, StatusDot } from "../../../../../../../../../components/badge";
import { BookingDays, useNow } from "../../../../../../../../../components/booking-agenda";
import { EmptyState } from "../../../../../../../../../components/empty";
import { ListRow, Panel, PanelBody, Ruled } from "../../../../../../../../../components/panel";
import { ProductGlyph } from "../../../../../../../../../components/product-glyph";
import { Screen } from "../../../../../../../../../components/screen";
import { SectionHeading } from "../../../../../../../../../components/section-heading";
import { Text } from "../../../../../../../../../components/text";
import { WeekHours } from "../../../../../../../../../components/week-hours";
import { formatTime } from "../../../../../../../../../lib/format-scheduling";
import {
  useSchedulingBookings,
  useSchedulingHost,
} from "../../../../../../../../../lib/queries-scheduling";
import { CALENDAR_PROVIDER_LABELS } from "../../../../../../../../../lib/status-scheduling";
import { space } from "../../../../../../../../../lib/theme";
import type { EnvironmentParams } from "../../../../../../../../../lib/web";

export default function HostScreen() {
  const { hostId, ...params } = useLocalSearchParams<EnvironmentParams & { hostId: string }>();
  const now = useNow();
  const query = useSchedulingHost(params, hostId);
  const upcoming = useSchedulingBookings(params, { view: "upcoming", host: hostId });
  const options = <Stack.Screen options={{ title: "Host" }} />;
  if (query.isPending) return <Screen loading="detail">{options}</Screen>;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { host, schedules, calendars } = query.data as SchedulingHostResponse;
  const schedule = schedules.find((item) => item.is_default) ?? schedules[0];
  const disconnected = calendars.filter((calendar) => calendar.status === "needs_reauth");
  const bookings = upcoming.data?.pages[0]?.data.slice(0, 8) ?? [];
  return (
    <Screen onRefresh={() => Promise.all([query.refetch(), upcoming.refetch()])}>
      {options}
      <View style={styles.identity}>
        <Avatar name={host.name} size={48} />
        <View style={styles.identityText}>
          <Text selectable variant="title">
            {host.name}
          </Text>
          <View style={styles.meta}>
            {host.status === "active" ? (
              <StatusDot label="Active" tone="success" />
            ) : (
              <StatusDot label="Disabled" tone="neutral" />
            )}
            {host.uid ? (
              <Text muted variant="mono">
                {host.uid}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      {disconnected.length > 0 ? (
        <Alert
          description="Access to a calendar was lost, and this host isn't offered until it's back."
          title="Calendar disconnected"
          tone="error"
        />
      ) : null}
      <Panel
        description={host.time_zone.replace(/_/g, " ")}
        meta={`${formatTime(now, host.time_zone)} there`}
        title={schedule?.name ?? "Working hours"}
      >
        <PanelBody>
          {schedule ? (
            <>
              <WeekHours now={now} rules={schedule.rules} timeZone={schedule.time_zone} />
              {schedule.overrides > 0 ? (
                <Text muted variant="small">
                  {schedule.overrides} date {schedule.overrides === 1 ? "override" : "overrides"}
                </Text>
              ) : null}
            </>
          ) : (
            <Text muted variant="small">
              No working hours yet, so this host can't be booked.
            </Text>
          )}
        </PanelBody>
      </Panel>
      <Panel title="Calendars">
        {calendars.length === 0 ? (
          <EmptyState
            description="Without a calendar, only coss.com's own bookings block this host's time."
            icon={CalendarOff}
            title="No calendars connected"
            tone="scheduling"
          />
        ) : (
          <Ruled>
            {calendars.map((calendar) => (
              <ListRow
                key={calendar.id}
                leading={<ProductGlyph icon={CalendarSync} size={32} tone="scheduling" />}
                subtitle={
                  calendar.status === "needs_reauth"
                    ? "Access lost"
                    : `Reading ${calendar.reading_busy} of ${calendar.calendars} ${calendar.calendars === 1 ? "calendar" : "calendars"}`
                }
                title={CALENDAR_PROVIDER_LABELS[calendar.provider]}
                trailing={
                  calendar.status === "needs_reauth" ? (
                    <Badge variant="error">Reconnect</Badge>
                  ) : calendar.unverified > 0 ? (
                    <Badge variant="warning">Not checked</Badge>
                  ) : (
                    <StatusDot tone="success" />
                  )
                }
              />
            ))}
          </Ruled>
        )}
      </Panel>
      {bookings.length > 0 ? (
        <View>
          <SectionHeading title="Upcoming" />
          <BookingDays bookings={bookings} environment={params} live now={now} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: space.md },
  identityText: { flex: 1, gap: space.xs },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
