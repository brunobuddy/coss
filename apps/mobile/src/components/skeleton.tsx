import { createContext, use, useEffect } from "react";
import { type DimensionValue, StyleSheet, View } from "react-native";
import Animated, {
  type AnimatedStyle,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors, radius, space } from "../lib/theme";

export type SkeletonShape = "list" | "detail" | "stats";

type PulseStyle = AnimatedStyle<{ opacity: number }>;

const PulseContext = createContext<PulseStyle | null>(null);

/** One grey block of a skeleton; blocks in a `SkeletonPage` pulse together. */
export function Skeleton(props: { width?: DimensionValue; height?: number; radius?: number }) {
  const pulse = use(PulseContext);
  return (
    <Animated.View
      style={[
        styles.block,
        {
          width: props.width ?? "100%",
          height: props.height ?? 12,
          borderRadius: props.radius ?? radius.sm,
        },
        pulse,
      ]}
    />
  );
}

function PanelSkeleton(props: { rows: number; header?: boolean }) {
  return (
    <View style={styles.panel}>
      {props.header ? (
        <View style={styles.panelHeader}>
          <Skeleton height={14} width="38%" />
        </View>
      ) : null}
      <View style={styles.card}>
        {Array.from({ length: props.rows }, (_, row) => `row-${row}`).map((key, index) => (
          <View key={key} style={[styles.row, index > 0 && styles.rowRule]}>
            <View style={styles.rowText}>
              <Skeleton height={13} width={index % 2 ? "52%" : "68%"} />
              <Skeleton height={10} width={index % 2 ? "74%" : "44%"} />
            </View>
            <Skeleton height={10} width={44} />
          </View>
        ))}
      </View>
    </View>
  );
}

function StatsSkeleton() {
  return (
    <View style={styles.stats}>
      {["a", "b"].map((key, index) => (
        <View key={key} style={[styles.stat, index > 0 && styles.statRule]}>
          <Skeleton height={10} width="46%" />
          <Skeleton height={26} width="62%" />
        </View>
      ))}
    </View>
  );
}

/** What a page will look like, so arriving content doesn't move anything. */
export function SkeletonPage({ shape }: { shape: SkeletonShape }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withDelay(
      240,
      withRepeat(withTiming(0.45, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [opacity, reduced]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <PulseContext value={pulse}>
      {/* A fast response never shows the skeleton at all. */}
      <Animated.View entering={FadeIn.delay(120).duration(160)} style={styles.column}>
        <View style={styles.intro}>
          <Skeleton height={13} width="88%" />
          <Skeleton height={13} width="56%" />
        </View>
        {shape === "stats" ? <StatsSkeleton /> : null}
        {shape === "list" ? <PanelSkeleton rows={7} /> : <PanelSkeleton header rows={4} />}
        {shape === "list" ? null : <PanelSkeleton header rows={2} />}
      </Animated.View>
    </PulseContext>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.xl },
  block: { backgroundColor: colors.muted },
  intro: { gap: space.sm, paddingVertical: space.xs },
  panel: {
    borderRadius: radius.frame,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.tray,
  },
  panelHeader: { paddingHorizontal: space.lg, paddingVertical: 15 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.frame,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    margin: -StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    minHeight: 58,
  },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 7 },
  stats: {
    flexDirection: "row",
    borderRadius: radius.frame,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  stat: { flex: 1, gap: space.sm, padding: space.lg },
  statRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
});
