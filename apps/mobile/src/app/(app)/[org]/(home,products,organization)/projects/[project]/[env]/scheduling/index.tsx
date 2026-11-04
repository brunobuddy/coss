import type { SchedulingBookingView } from "@coss/companion";
import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { type Href, useLocalSearchParams } from "expo-router";
import { CalendarClock, ListChecks, UserRound } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { Avatar } from "../../../../../../../../components/avatar";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import {
  BookingCard,
  BookingDays,
  useNow,
  WeekStrip,
} from "../../../../../../../../components/booking-agenda";
import { Button } from "../../../../../../../../components/button";
import { EmptyState } from "../../../../../../../../components/empty";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow, Panel, SpecItem, SpecList } from "../../../../../../../../components/panel";
import { ProductGlyph } from "../../../../../../../../components/product-glyph";
import { Screen, useEndReached } from "../../../../../../../../components/screen";
import { SectionHeading } from "../../../../../../../../components/section-heading";
import { Skeleton } from "../../../../../../../../components/skeleton";
import { Segmented, Tabs } from "../../../../../../../../components/tabs";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import {
  addDays,
  dayKey,
  formatDuration,
  localTimeZone,
} from "../../../../../../../../lib/format-scheduling";
import { useOrganization } from "../../../../../../../../lib/queries";
import {
  useSchedulingBookings,
  useSchedulingEventTypes,
  useSchedulingHosts,
  useSchedulingSettings,
} from "../../../../../../../../lib/queries-scheduling";
import {
  CALENDAR_FAILURE_LABELS,
  EVENT_TYPE_KIND_ICONS,
  EVENT_TYPE_KIND_LABELS,
} from "../../../../../../../../lib/status-scheduling";
import { motion, radius, space } from "../../../../../../../../lib/theme";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

type View_ = "bookings" | "hosts" | "event-types" | "settings";

const VIEWS: { value: View_; label: string }[] = [
  { value: "bookings", label: "Bookings" },
  { value: "hosts", label: "Hosts" },
  { value: "event-types", label: "Event types" },
  { value: "settings", label: "Settings" },
];

const AGENDA: { value: Exclude<SchedulingBookingView, "pending">; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

function AgendaSkeleton() {
  return (
    <View style={styles.agendaSkeleton}>
      <Skeleton height={16} width="32%" />
      <View style={styles.agendaSkeletonCard}>
        {["a", "b", "c"].map((key) => (
          <View key={key} style={styles.agendaSkeletonRow}>
            <Skeleton height={13} width={40} />
            <Skeleton height={36} radius={2} width={3} />
            <View style={styles.agendaSkeletonText}>
              <Skeleton height={13} width="62%" />
              <Skeleton height={11} width="44%" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Bookings(props: { params: EnvironmentParams; canChange: boolean }) {
  const { params } = props;
  const now = useNow();
  const [agenda, setAgenda] = useState<(typeof AGENDA)[number]["value"]>("upcoming");
  const [day, setDay] = useState<Date | null>(null);
  const range = useMemo(
    () => (day ? { from: day.toISOString(), to: addDays(day, 1).toISOString() } : null),
    [day],
  );
  const bookings = useSchedulingBookings(params, {
    view: agenda,
    day: agenda === "upcoming" ? range : null,
  });
  const all = useSchedulingBookings(params, { view: "upcoming" });
  const pending = useSchedulingBookings(params, { view: "pending" });
  const items = bookings.data?.pages.flatMap((page) => page.data) ?? [];
  const pendingItems = pending.data?.pages.flatMap((page) => page.data) ?? [];
  const showPending = agenda === "upcoming" && !day && pendingItems.length > 0;
  // Pending ones sit in their own card above, so they aren't listed twice.
  const listed = showPending ? items.filter((item) => item.status !== "pending_approval") : items;
  const marked = useMemo(() => {
    const map = new Map<string, "booked" | "attention">();
    for (const page of all.data?.pages ?? []) {
      for (const booking of page.data) {
        const key = dayKey(new Date(booking.start));
        if (booking.status === "pending_approval" || booking.external_conflict_at) {
          map.set(key, "attention");
        } else if (!map.has(key)) map.set(key, "booked");
      }
    }
    return map;
  }, [all.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = bookings;
  const loadMore = useMemo(
    () => (hasNextPage && !isFetchingNextPage ? () => void fetchNextPage() : null),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );
  useEndReached(loadMore);
  const reduced = useReducedMotion();
  return (
    <>
      <Segmented
        items={AGENDA}
        onChange={(value) => {
          setAgenda(value);
          setDay(null);
        }}
        value={agenda}
      />
      {agenda === "upcoming" ? (
        <WeekStrip
          marked={marked}
          now={now}
          onSelect={setDay}
          selected={day ? dayKey(day) : null}
        />
      ) : null}
      {showPending ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(motion.arrive)}>
          <SectionHeading detail={String(pendingItems.length)} title="Awaiting approval" />
          <BookingCard
            actions={props.canChange}
            bookings={pendingItems}
            environment={params}
            now={now}
          />
        </Animated.View>
      ) : null}
      {bookings.isPending ? (
        <AgendaSkeleton />
      ) : bookings.isError && !bookings.data ? (
        <EmptyState
          action={
            <Button
              onPress={() => void bookings.refetch()}
              size="sm"
              title="Try again"
              variant="outline"
            />
          }
          description={bookings.error.message}
          icon={CalendarClock}
          title="Couldn't load this"
          tone="scheduling"
        />
      ) : listed.length === 0 ? (
        showPending ? null : (
          <EmptyState
            description={
              day
                ? "Nothing is booked for this day."
                : agenda === "upcoming"
                  ? "Add a host and an event type, then book through the API or a hosted page."
                  : "Bookings that have ended show up here."
            }
            icon={CalendarClock}
            title={
              day
                ? "Nothing booked"
                : agenda === "upcoming"
                  ? "No bookings yet"
                  : "No past bookings"
            }
            tone="scheduling"
          />
        )
      ) : (
        <BookingDays
          bookings={listed}
          environment={params}
          live={agenda === "upcoming"}
          now={now}
        />
      )}
      <Text muted style={styles.zone} variant="small">
        All times in {localTimeZone().replace(/_/g, " ")}. Attendee details are erased{" "}
        {formatRetentionDays(RETENTION_DAYS.schedulingPersonalData)} after a booking ends.
      </Text>
    </>
  );
}

function Hosts({ params }: { params: EnvironmentParams }) {
  const hosts = useSchedulingHosts(params);
  const items = hosts.data?.pages.flatMap((page) => page.data) ?? [];
  const base = environmentPath(params);
  return (
    <PagedPanel
      empty={{
        icon: UserRound,
        title: "No hosts yet",
        description:
          "Hosts are the people who can be booked. Add them on coss.com or through the API.",
        tone: "scheduling",
      }}
      items={items}
      query={hosts}
      render={(host) => (
        <ListRow
          href={`${base}/scheduling/hosts/${host.id}` as Href}
          key={host.id}
          leading={<Avatar name={host.name} />}
          subtitle={host.time_zone.replace(/_/g, " ")}
          title={host.name}
          trailing={
            host.status === "active" ? undefined : (
              <StatusDot label="Disabled" muted tone="neutral" />
            )
          }
        />
      )}
    />
  );
}

function EventTypes({ params }: { params: EnvironmentParams }) {
  const eventTypes = useSchedulingEventTypes(params);
  const items = eventTypes.data?.pages.flatMap((page) => page.data) ?? [];
  const base = environmentPath(params);
  return (
    <PagedPanel
      empty={{
        icon: ListChecks,
        title: "No event types yet",
        description: "An event type is something that can be booked, like a 30-minute call.",
        tone: "scheduling",
      }}
      items={items}
      query={eventTypes}
      render={(eventType) => (
        <ListRow
          detail={formatDuration(eventType.duration_minutes)}
          href={`${base}/scheduling/event-types/${eventType.id}` as Href}
          key={eventType.id}
          leading={
            <ProductGlyph
              icon={EVENT_TYPE_KIND_ICONS[eventType.kind]}
              size={32}
              tone="scheduling"
            />
          }
          subtitle={`${EVENT_TYPE_KIND_LABELS[eventType.kind]} · ${eventType.hosts} ${eventType.hosts === 1 ? "host" : "hosts"}${eventType.requires_approval ? " · Approval" : ""}`}
          title={eventType.title}
          trailing={
            eventType.status === "archived" ? <Badge variant="outline">Archived</Badge> : undefined
          }
        />
      )}
    />
  );
}

function SchedulingSettings({ params }: { params: EnvironmentParams }) {
  const settings = useSchedulingSettings(params);
  const data = settings.data;
  if (!data) {
    return settings.isError ? (
      <EmptyState
        action={
          <Button
            onPress={() => void settings.refetch()}
            size="sm"
            title="Try again"
            variant="outline"
          />
        }
        description={settings.error.message}
        icon={CalendarClock}
        title="Couldn't load this"
        tone="scheduling"
      />
    ) : (
      <AgendaSkeleton />
    );
  }
  return (
    <>
      <Panel title="Branding">
        <SpecList>
          <SpecItem label="Name">{data.brand_name ?? "—"}</SpecItem>
          <SpecItem label="Accent colour" mono>
            {data.accent_color ?? "—"}
          </SpecItem>
        </SpecList>
      </Panel>
      <Panel title="Messages">
        <SpecList>
          <SpecItem label="Emails from" mono>
            {data.email_from ?? "—"}
          </SpecItem>
          <SpecItem label="SMS from" mono>
            {data.sms_from ?? "—"}
          </SpecItem>
        </SpecList>
      </Panel>
      <Panel title="Calendars">
        <SpecList>
          <SpecItem label="When one can't be read" stacked>
            {CALENDAR_FAILURE_LABELS[data.calendar_failure_mode]}
          </SpecItem>
        </SpecList>
      </Panel>
      <Panel title="Embedding">
        <SpecList>
          <SpecItem label="Allowed sites" mono stacked>
            {data.allowed_origins.length > 0 ? data.allowed_origins.join("\n") : "—"}
          </SpecItem>
        </SpecList>
      </Panel>
    </>
  );
}

export default function SchedulingScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const organization = useOrganization(params.org);
  const [view, setView] = useState<View_>("bookings");
  const base = environmentPath(params);
  const webPath: Record<View_, string> = {
    bookings: `${base}/scheduling`,
    hosts: `${base}/scheduling/hosts`,
    "event-types": `${base}/scheduling/event-types`,
    settings: `${base}/scheduling/settings`,
  };
  return (
    <Screen onRefresh={() => organization.refetch()} title="Scheduling">
      <WebButton path={webPath[view]} />
      <ModeBadge params={params} sandboxOnly />
      <Tabs items={VIEWS} onChange={setView} value={view} />
      {view === "bookings" ? (
        <Bookings canChange={organization.data?.can.update_scheduling ?? false} params={params} />
      ) : view === "hosts" ? (
        <Hosts params={params} />
      ) : view === "event-types" ? (
        <EventTypes params={params} />
      ) : (
        <SchedulingSettings params={params} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  zone: { paddingHorizontal: space.xxs },
  agendaSkeleton: { gap: space.sm },
  agendaSkeletonCard: {
    borderRadius: radius.frame,
    gap: space.xl,
    padding: space.lg,
  },
  agendaSkeletonRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  agendaSkeletonText: { flex: 1, gap: 7 },
});
