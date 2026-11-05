import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import type { Tone } from "../lib/theme";
import { colors, radius, space, useFinish } from "../lib/theme";
import { StatusDot } from "./badge";
import { useSlidingIndicator } from "./sliding";
import { Text } from "./text";

export type TabItem<T extends string> = {
  value: T;
  label: string;
  count?: number | string;
  tone?: Tone;
};

/** The dashboard's underlined tabs (an email's Content / Events / Recipients…). */
export function Tabs<T extends string>(props: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const indicator = useSlidingIndicator(props.value);
  return (
    <ScrollView
      contentContainerStyle={styles.tabs}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabsBar}
    >
      {props.items.map((item) => {
        const selected = item.value === props.value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={item.value}
            onLayout={indicator.onItemLayout(item.value)}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync();
              props.onChange(item.value);
            }}
            style={styles.tab}
          >
            <Text muted={!selected} variant="label">
              {item.label}
            </Text>
            {item.count !== undefined ? (
              <Text muted variant="mono">
                {item.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
      <Animated.View pointerEvents="none" style={[styles.underline, indicator.style]} />
    </ScrollView>
  );
}

/** The sidebar's environment switcher: a raised thumb sliding in a shaded well. */
export function Segmented<T extends string>(props: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const finish = useFinish();
  const indicator = useSlidingIndicator(props.value);
  return (
    <View style={[styles.track, { experimental_backgroundImage: finish.wellGradient }]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.thumb, { boxShadow: finish.raised }, indicator.style]}
      />
      {props.items.map((item) => {
        const selected = item.value === props.value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={item.value}
            onLayout={indicator.onItemLayout(item.value)}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync();
              props.onChange(item.value);
            }}
            style={styles.segment}
          >
            {item.tone ? <StatusDot tone={item.tone} /> : null}
            <Text
              muted={!selected}
              numberOfLines={1}
              style={styles.segmentLabel}
              variant="smallMedium"
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabsBar: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabs: { gap: space.xl, paddingHorizontal: space.xxs },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    minHeight: 44,
  },
  underline: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.foreground,
  },
  track: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumb: {
    position: "absolute",
    left: 0,
    top: 3,
    bottom: 3,
    borderRadius: radius.md,
    backgroundColor: colors.raised,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  segmentLabel: { flexShrink: 1 },
});
