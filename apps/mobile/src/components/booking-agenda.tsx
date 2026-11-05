import type { SchedulingBooking } from "@coss/companion";
import * as Haptics from "expo-haptics";
import { type Href, Link } from "expo-router";
import { Check, TriangleAlert, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Alert as NativeAlert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { FadeIn, LinearTransition, useReducedMotion } from "react-native-reanimated";
import {
  addDays,
  dayKey,
  formatDayHeading,
  formatDuration,
  formatShortDay,
  formatTime,
  formatUntil,
  groupByDay,
  minutesBetween,
  nowLineIndex,
  startOfDay,
} from "../lib/format-scheduling";
import type { EnvironmentKey } from "../lib/queries";
import { useBookingAction } from "../lib/queries-scheduling";
import { BOOKING_RULE, BOOKING_STATUS_LABELS, BOOKING_STATUS_TONE } from "../lib/status-scheduling";
import { colors, motion, productColors, radius, space, useFinish } from "../lib/theme";
import { environmentPath } from "../lib/web";
import { StatusDot } from "./badge";
import { Icon } from "./icon";
import { Ruled } from "./panel";
import { Text } from "./text";

const SCHEDULING = productColors("scheduling");
const STRIP_DAYS = 21;

/** One re-render a minute: the "now" line and "in 40 min" stay honest while the screen is open. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function attendeeName(booking: SchedulingBooking): string {
  const [first, ...others] = booking.attendees;
  const name = first?.name ?? first?.uid ?? "Attendee details removed";
  return others.length > 0 ? `${name} +${others.length}` : name;
}

/** A day of the next three weeks: tap to see only that day, tap again for all of them. */
export function WeekStrip(props: {
  now: Date;
  marked: ReadonlyMap<string, "booked" | "attention">;
  selected: string | null;
  onSelect: (day: Date | null) => void;
}) {
  const finish = useFinish();
  const today = startOfDay(props.now);
  const days = Array.from({ length: STRIP_DAYS }, (_, index) => addDays(today, index));
  return (
    <ScrollView
      contentContainerStyle={styles.strip}
      decelerationRate="fast"
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.stripFrame}
    >
      {days.map((day) => {
        const key = dayKey(day);
        const selected = props.selected === key;
        const isToday = key === dayKey(today);
        const mark = props.marked.get(key);
        return (
          <Pressable
            accessibilityLabel={`${formatShortDay(day)}${mark ? ", has bookings" : ""}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={key}
            onPress={() => {
              void Haptics.selectionAsync();
              props.onSelect(selected ? null : day);
            }}
            style={[
              styles.day,
              selected && styles.daySelected,
              selected && { boxShadow: finish.primaryEdge },
            ]}
          >
            <Text
              style={[styles.dayName, selected && styles.dayTextSelected]}
              muted={!selected}
              variant="caps"
            >
              {day.toLocaleDateString("en-GB", { weekday: "narrow" })}
            </Text>
            <Text
              style={[
                styles.dayNumber,
                isToday && !selected && { color: SCHEDULING.text },
                selected && styles.dayTextSelected,
              ]}
              variant="label"
            >
              {day.getDate()}
            </Text>
            <View
              style={[
                styles.dayMark,
                mark === "attention"
                  ? styles.dayMarkAttention
                  : mark
                    ? { backgroundColor: selected ? colors.primaryForeground : SCHEDULING.solid }
                    : null,
              ]}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function NowLine({ now }: { now: Date }) {
  return (
    <View accessibilityLabel={`Now, ${formatTime(now)}`} style={styles.nowLine}>
      <Text style={[styles.nowTime, { color: SCHEDULING.text }]} variant="mono">
        {formatTime(now)}
      </Text>
      <View style={[styles.nowDot, { backgroundColor: SCHEDULING.solid }]} />
      <View style={[styles.nowRule, { backgroundColor: SCHEDULING.solid }]} />
    </View>
  );
}

export function BookingRow(props: {
  booking: SchedulingBooking;
  environment: EnvironmentKey;
  now: Date;
  next?: boolean;
  /** Not under a day's heading: the row says which day. */
  dated?: boolean;
  /** Offer approving and declining by swiping (only pending bookings, and members who can). */
  actions?: boolean;
}) {
  const { booking, now } = props;
  const ended = booking.status === "cancelled" || booking.status === "declined";
  const running =
    !ended && Date.parse(booking.start) <= now.getTime() && Date.parse(booking.end) > now.getTime();
  const past = Date.parse(booking.end) <= now.getTime();
  const confirmed = booking.status === "confirmed";
  const until = props.next && confirmed ? formatUntil(booking.start, now) : null;
  const expires = booking.approval_expires_at
    ? formatUntil(booking.approval_expires_at, now)
    : null;
  const rule = confirmed
    ? past
      ? colors.input
      : SCHEDULING.solid
    : colors[BOOKING_RULE[booking.status as keyof typeof BOOKING_RULE]];
  const href = `${environmentPath(props.environment)}/scheduling/bookings/${booking.id}` as Href;
  const muted = ended || past;
  const row = (
    <Link asChild href={href} onPress={() => void Haptics.selectionAsync()}>
      <Pressable
        accessibilityLabel={`${formatTime(booking.start)}, ${booking.title}, ${attendeeName(booking)}, ${BOOKING_STATUS_LABELS[booking.status]}`}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.row,
              (running || props.next) && { backgroundColor: SCHEDULING.wash },
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.when}>
              <Text muted={muted} numberOfLines={1} style={styles.whenTime} variant="mono">
                {formatTime(booking.start)}
              </Text>
              <Text muted style={styles.whenDuration} variant="mono">
                {props.dated
                  ? new Date(booking.start).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                    })
                  : formatDuration(minutesBetween(booking.start, booking.end))}
              </Text>
            </View>
            <View style={[styles.rule, { backgroundColor: rule }]} />
            <View style={styles.rowText}>
              <View style={styles.rowTitleLine}>
                <Text
                  muted={muted}
                  numberOfLines={1}
                  style={[styles.rowTitle, ended && styles.struck]}
                  variant="label"
                >
                  {booking.title}
                </Text>
                {running ? (
                  <Text style={{ color: SCHEDULING.text }} variant="caps">
                    Now
                  </Text>
                ) : until ? (
                  <Text style={{ color: SCHEDULING.text }} variant="mono">
                    {until}
                  </Text>
                ) : null}
              </View>
              <Text muted numberOfLines={1} variant="small">
                {attendeeName(booking)}
                {booking.hosts[0] ? ` · ${booking.hosts[0].name}` : ""}
              </Text>
              {booking.status !== "confirmed" ? (
                <StatusDot
                  label={
                    booking.status === "pending_approval" && expires
                      ? `Expires ${expires}`
                      : BOOKING_STATUS_LABELS[booking.status]
                  }
                  muted
                  tone={BOOKING_STATUS_TONE[booking.status]}
                />
              ) : booking.no_show_at ? (
                <StatusDot label="No-show" muted tone="neutral" />
              ) : null}
              {booking.external_conflict_at && !ended ? (
                <View style={styles.conflict}>
                  <Icon color="warningForeground" icon={TriangleAlert} size={13} />
                  <Text style={{ color: colors.warningForeground }} variant="small">
                    Calendar conflict
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </Pressable>
    </Link>
  );
  if (props.actions && booking.status === "pending_approval") {
    return <SwipeableBooking id={booking.id} environment={props.environment} row={row} />;
  }
  return row;
}

function SwipeableBooking(props: {
  id: string;
  environment: EnvironmentKey;
  row: React.ReactNode;
}) {
  const action = useBookingAction(props.environment, props.id);
  const swipe = useRef<React.ComponentRef<typeof ReanimatedSwipeable>>(null);
  const run = (kind: "approve" | "decline") => {
    swipe.current?.close();
    action.mutate(kind, {
      onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      onError: (error) => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        NativeAlert.alert("Couldn't do that", error.message);
      },
    });
  };
  return (
    <ReanimatedSwipeable
      friction={1.6}
      overshootRight={false}
      ref={swipe}
      renderRightActions={() => (
        <View style={styles.swipeActions}>
          <Pressable
            accessibilityLabel="Decline booking"
            onPress={() =>
              NativeAlert.alert(
                "Decline this booking?",
                "The time is freed and the attendee told. This can't be undone.",
                [
                  { text: "Keep it", style: "cancel" },
                  {
                    text: "Decline booking",
                    style: "destructive",
                    onPress: () => run("decline"),
                  },
                ],
              )
            }
            style={[styles.swipeAction, styles.swipeDecline]}
          >
            <Icon color="destructiveForeground" icon={X} size={18} strokeWidth={2.25} />
            <Text style={{ color: colors.destructiveForeground }} variant="smallMedium">
              Decline
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Approve booking"
            onPress={() => run("approve")}
            style={[styles.swipeAction, styles.swipeApprove]}
          >
            <Icon color="successForeground" icon={Check} size={18} strokeWidth={2.25} />
            <Text style={{ color: colors.successForeground }} variant="smallMedium">
              Approve
            </Text>
          </Pressable>
        </View>
      )}
    >
      <View style={styles.swipeBody}>{props.row}</View>
    </ReanimatedSwipeable>
  );
}

/** Bookings from several days in one card, each saying its day (those awaiting approval). */
export function BookingCard(props: {
  bookings: SchedulingBooking[];
  environment: EnvironmentKey;
  now: Date;
  actions?: boolean;
}) {
  const finish = useFinish();
  return (
    <View style={[styles.card, { boxShadow: finish.panel }]}>
      <Ruled>
        {props.bookings.map((booking) => (
          <BookingRow
            actions={props.actions}
            booking={booking}
            dated
            environment={props.environment}
            key={booking.id}
            now={props.now}
          />
        ))}
      </Ruled>
    </View>
  );
}

/** Bookings sorted by start, by local day: each day a card, with a line where "now" falls today. */
export function BookingDays(props: {
  bookings: SchedulingBooking[];
  environment: EnvironmentKey;
  now: Date;
  /** Upcoming: draw the "now" line and pick out the next booking. */
  live?: boolean;
  actions?: boolean;
}) {
  const finish = useFinish();
  const reduced = useReducedMotion();
  const { now, live } = props;
  const days = groupByDay(props.bookings);
  const todayKey = dayKey(now);
  const nextId = live
    ? props.bookings.find(
        (booking) => booking.status === "confirmed" && Date.parse(booking.start) > now.getTime(),
      )?.id
    : undefined;
  return (
    <View style={styles.days}>
      {days.map((day) => {
        const isToday = day.key === todayKey;
        const line = live && isToday ? nowLineIndex(day.items, now) : -1;
        return (
          <Animated.View
            entering={reduced ? undefined : FadeIn.duration(motion.arrive)}
            key={day.key}
            layout={reduced ? undefined : LinearTransition.duration(motion.arrive)}
            style={styles.dayGroup}
          >
            <View style={styles.dayHeading}>
              <Text variant="heading">{formatDayHeading(day.date, now)}</Text>
              {formatDayHeading(day.date, now) !== formatShortDay(day.date) ? (
                <Text muted variant="small">
                  {formatShortDay(day.date)}
                </Text>
              ) : null}
              <View style={styles.dayHeadingFill} />
              <Text muted variant="mono">
                {day.items.length}
              </Text>
            </View>
            <View style={[styles.card, { boxShadow: finish.panel }]}>
              <Ruled>
                {day.items.flatMap((booking, index) => [
                  ...(index === line ? [<NowLine key="now" now={now} />] : []),
                  <BookingRow
                    actions={props.actions}
                    booking={booking}
                    environment={props.environment}
                    key={booking.id}
                    next={booking.id === nextId}
                    now={now}
                  />,
                ])}
                {line === day.items.length ? <NowLine key="now" now={now} /> : null}
              </Ruled>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stripFrame: { flexGrow: 0, marginHorizontal: -space.lg },
  strip: { gap: space.xs, paddingHorizontal: space.lg, paddingVertical: space.xxs },
  day: {
    minWidth: 44,
    alignItems: "center",
    gap: space.xxs,
    paddingTop: space.sm,
    paddingBottom: 7,
    borderRadius: radius.xl,
  },
  daySelected: { backgroundColor: colors.primary },
  dayName: { letterSpacing: 0 },
  dayNumber: { fontVariant: ["tabular-nums"] },
  dayTextSelected: { color: colors.primaryForeground },
  dayMark: { width: 5, height: 5, borderRadius: 2.5, marginTop: 1 },
  dayMarkAttention: { backgroundColor: colors.warning },
  days: { gap: space.xl },
  dayGroup: { gap: space.sm },
  dayHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm,
    paddingHorizontal: space.xxs,
  },
  dayHeadingFill: { flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.frame,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    minHeight: 64,
  },
  rowPressed: { backgroundColor: colors.muted },
  when: { minWidth: 46, gap: space.xxs },
  whenTime: { fontSize: 13, lineHeight: 20 },
  whenDuration: { fontSize: 11, lineHeight: 15 },
  rule: { width: 3, borderRadius: 1.5 },
  rowText: { flex: 1, gap: space.xxs },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowTitle: { flex: 1 },
  struck: { textDecorationLine: "line-through" },
  conflict: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xxs },
  nowLine: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingLeft: space.lg,
  },
  nowTime: { minWidth: 46, fontSize: 11, lineHeight: 14 },
  nowDot: { width: 7, height: 7, borderRadius: 3.5, marginLeft: 10 },
  nowRule: { flex: 1, height: 1, opacity: 0.5 },
  swipeBody: { backgroundColor: colors.card },
  swipeActions: { flexDirection: "row" },
  swipeAction: {
    width: 84,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  swipeApprove: { backgroundColor: colors.successTint },
  swipeDecline: { backgroundColor: colors.destructiveTint },
});
