import type { SchedulingScheduleRule } from "@coss/companion";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { weeklySpans, zonedNow } from "../lib/format-scheduling";
import { colors, productColors, radius, space } from "../lib/theme";
import { Text } from "./text";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MINUTES = 24 * 60;
const TICKS = [0, 6, 12, 18, 24];
const SCHEDULING = productColors("scheduling");

function describe(spans: { start: number; end: number }[]): string {
  const time = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return spans.length === 0
    ? "unavailable"
    : spans.map((span) => `${time(span.start)} to ${time(span.end)}`).join(", ");
}

/** A week of working hours: seven days on a 24-hour track, with a tick at the host's "now". */
export function WeekHours(props: { rules: SchedulingScheduleRule[]; timeZone: string; now: Date }) {
  const week = weeklySpans(props.rules);
  const { weekday, minutes } = zonedNow(props.now, props.timeZone);
  const [trackWidth, setTrackWidth] = useState(0);
  return (
    <View style={styles.chart}>
      {week.map((spans, index) => {
        const name = DAY_NAMES[index] ?? "";
        const today = index === weekday;
        return (
          <View
            accessibilityLabel={`${name}: ${describe(spans)}`}
            accessible
            key={name}
            style={styles.row}
          >
            <Text
              muted={!today}
              style={[styles.day, today && { color: SCHEDULING.text }]}
              variant="caps"
            >
              {name}
            </Text>
            <View
              onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
              style={styles.track}
            >
              {TICKS.slice(1, -1).map((tick) => (
                <View key={tick} style={[styles.gridLine, { left: `${(tick / 24) * 100}%` }]} />
              ))}
              {spans.map((span) => (
                <View
                  key={span.start}
                  style={[
                    styles.span,
                    {
                      left: `${(span.start / DAY_MINUTES) * 100}%`,
                      width: `${((span.end - span.start) / DAY_MINUTES) * 100}%`,
                      backgroundColor: SCHEDULING.tile,
                      borderColor: SCHEDULING.ring,
                    },
                  ]}
                />
              ))}
              {today ? (
                <View
                  style={[
                    styles.nowTick,
                    {
                      backgroundColor: SCHEDULING.solid,
                      transform: [{ translateX: (minutes / DAY_MINUTES) * trackWidth }],
                    },
                  ]}
                />
              ) : null}
            </View>
          </View>
        );
      })}
      <View style={styles.axis}>
        <View style={styles.day} />
        <View style={styles.axisLabels}>
          {TICKS.map((tick) => (
            <Text key={tick} muted style={styles.axisLabel} variant="mono">
              {String(tick).padStart(2, "0")}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  day: { width: 32 },
  track: {
    flex: 1,
    height: 20,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  gridLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  span: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nowTick: { position: "absolute", left: -1, top: 0, bottom: 0, width: 2 },
  axis: { flexDirection: "row", gap: space.sm, marginTop: space.xxs },
  axisLabels: { flex: 1, flexDirection: "row", justifyContent: "space-between" },
  axisLabel: { fontSize: 11, lineHeight: 14 },
});
