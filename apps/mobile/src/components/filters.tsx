import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import { colors, radius, space, type Tone, useFinish } from "../lib/theme";
import { useSlidingIndicator } from "./sliding";
import { Text } from "./text";

export type Filter<T extends string> = { value: T | null; label: string; tone?: Tone };

/** The dashboard's filter links: a recessed track with a raised pill sliding along it. */
export function FilterChips<T extends string>(props: {
  items: Filter<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
}) {
  const finish = useFinish();
  const indicator = useSlidingIndicator(props.value ?? "all");
  return (
    <ScrollView
      contentContainerStyle={styles.row}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.track, { experimental_backgroundImage: finish.wellGradient }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.pill, { boxShadow: finish.raised }, indicator.style]}
      />
      {props.items.map((item) => {
        const selected = item.value === props.value;
        const key = item.value ?? "all";
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={key}
            onLayout={indicator.onItemLayout(key)}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync();
              props.onChange(item.value);
            }}
            style={styles.chip}
          >
            <Text muted={!selected} variant="smallMedium">
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  track: {
    flexGrow: 0,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  row: { padding: 3 },
  pill: {
    position: "absolute",
    left: 0,
    top: 3,
    bottom: 3,
    borderRadius: radius.md,
    backgroundColor: colors.raised,
  },
  chip: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: space.md,
  },
});
