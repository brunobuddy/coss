import type { EnvironmentResponse } from "@coss/companion";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { formatCount, formatDay } from "../lib/format";
import { type ColorToken, colors } from "../lib/theme";
import { useArrival } from "./screen";
import { Text } from "./text";

type Day = EnvironmentResponse["activity"]["days"][number];

/** One stacked series: its legend label, colour and value on a day. */
export type BarSeries<D> = {
  key: string;
  label: string;
  color: ColorToken;
  value: (day: D) => number;
};

const SERIES: BarSeries<Day>[] = [
  { key: "sent", label: "Sent", color: "chartSent", value: (day) => day.sent },
  { key: "failed", label: "Failed", color: "destructive", value: (day) => day.failed },
  {
    key: "pending",
    label: "Queued or scheduled",
    color: "chartPending",
    value: (day) => day.queued + day.scheduled,
  },
  { key: "canceled", label: "Canceled", color: "chartCanceled", value: (day) => day.canceled },
];

const DASHES = Array.from({ length: 64 }, (_, n) => `dash-${n}`);

/** A dashed rule (React Native draws no dashed borders on one side). */
function Dashes() {
  return (
    <View style={styles.dashes}>
      {DASHES.map((key) => (
        <View key={key} style={styles.dash} />
      ))}
    </View>
  );
}

/** The environment overview's emails per day. */
export function ActivityChart({ days }: { days: Day[] }) {
  return (
    <StackedBars
      days={days}
      describe={(total) => `${total} emails`}
      format={formatCount}
      series={SERIES}
    />
  );
}

/** The dashboard's stacked daily bars: drag along them for each day's numbers (hover on the web). */
export function StackedBars<D extends { date: string }>({
  days,
  series: SERIES,
  format,
  describe,
}: {
  days: D[];
  series: BarSeries<D>[];
  /** A value as the legend and the axis show it. */
  format: (value: number) => string;
  /** A day's total for VoiceOver ("12 emails"). */
  describe: (total: number) => string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const totals = days.map((day) => SERIES.reduce((sum, series) => sum + series.value(day), 0));
  const max = Math.max(1, ...totals);
  const focus = selected === null ? null : days[selected];

  const arrived = useArrival();
  const reduced = useReducedMotion();
  const grow = useSharedValue(arrived && !reduced ? 0 : 1);
  useEffect(() => {
    grow.value = withDelay(
      60,
      withTiming(1, { duration: 460, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }),
    );
  }, [grow]);
  const growStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));

  const plotWidth = useRef(0);
  const scrubbing = useRef(false);
  const dayAt = (x: number) => {
    if (plotWidth.current === 0 || days.length === 0) return null;
    const ratio = Math.min(0.999, Math.max(0, x / plotWidth.current));
    return Math.floor(ratio * days.length);
  };
  const scrubTo = (x: number) => {
    const day = dayAt(x);
    setSelected((current) => {
      if (day !== current) void Haptics.selectionAsync();
      return day;
    });
  };
  const gesture = Gesture.Race(
    Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-6, 6])
      .failOffsetY([-14, 14])
      .onBegin(() => {
        scrubbing.current = true;
      })
      .onUpdate((event) => scrubTo(event.x))
      .onFinalize(() => {
        scrubbing.current = false;
      }),
    Gesture.Tap()
      .runOnJS(true)
      .onEnd((event) => {
        const day = dayAt(event.x);
        void Haptics.selectionAsync();
        setSelected((current) => (current === day ? null : day));
      }),
  );

  return (
    <View style={styles.chart}>
      <View style={styles.legend}>
        {focus ? (
          <>
            <Text variant="mono">{formatDay(focus.date)}</Text>
            {SERIES.map((series) => (
              <View key={series.key} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: colors[series.color] }]} />
                <Text muted variant="mono">
                  {format(series.value(focus))}
                </Text>
              </View>
            ))}
          </>
        ) : (
          SERIES.map((series) => (
            <View key={series.key} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: colors[series.color] }]} />
              <Text muted style={styles.legendLabel} variant="small">
                {series.label}
              </Text>
            </View>
          ))
        )}
      </View>
      <View>
        <Dashes />
        <GestureDetector gesture={gesture}>
          <Animated.View
            onLayout={(event) => {
              plotWidth.current = event.nativeEvent.layout.width;
            }}
            style={[styles.plot, growStyle]}
          >
            {days.map((day, index) => (
              <View
                accessible
                accessibilityLabel={`${formatDay(day.date)}: ${describe(totals[index] ?? 0)}`}
                key={day.date}
                style={[styles.column, selected !== null && selected !== index && styles.dimmed]}
              >
                {totals[index] === 0 ? (
                  <View style={styles.empty} />
                ) : (
                  SERIES.map((series, position) => {
                    const value = series.value(day);
                    if (value === 0) return null;
                    const top = SERIES.slice(position + 1).every((above) => above.value(day) === 0);
                    return (
                      <View
                        key={series.key}
                        style={[
                          styles.segment,
                          position === 0 && styles.bottom,
                          top && styles.top,
                          {
                            height: `${(value / max) * 100}%`,
                            backgroundColor: colors[series.color],
                          },
                        ]}
                      />
                    );
                  })
                )}
              </View>
            ))}
          </Animated.View>
        </GestureDetector>
        <Dashes />
      </View>
      <View style={styles.axis}>
        <Text muted style={styles.axisLabel} variant="mono">
          {days[0] ? formatDay(days[0].date) : ""}
        </Text>
        <Text muted style={styles.axisLabel} variant="mono">
          max {format(max)}
        </Text>
        <Text muted style={styles.axisLabel} variant="mono">
          {days.at(-1) ? formatDay(days.at(-1)?.date ?? "") : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: 12 },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 12,
    rowGap: 4,
    minHeight: 18,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendLabel: { fontSize: 12 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  plot: {
    height: 128,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    paddingTop: 1,
    transformOrigin: "bottom",
  },
  dashes: { flexDirection: "row", gap: 3, overflow: "hidden", height: 1 },
  dash: { width: 4, height: 1, backgroundColor: colors.border },
  column: { flex: 1, height: "100%", flexDirection: "column-reverse" },
  dimmed: { opacity: 0.4 },
  segment: { minHeight: 2 },
  bottom: { borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  top: { borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  empty: { height: 2, borderRadius: 1, backgroundColor: colors.chartEmpty },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisLabel: { fontSize: 11 },
});
