import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
import { colors, type ProductTone, radius, space, usePalette } from "../lib/theme";
import { ProductGlyph } from "./product-glyph";
import { Text } from "./text";

const SPACING = 24;

/** `.drafting-grid`: coss.com's dot grid, behind empty states and the sign-in panel. */
export function DraftingGrid() {
  const palette = usePalette();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg height="100%" width="100%">
        <Defs>
          <Pattern height={SPACING} id="drafting" patternUnits="userSpaceOnUse" width={SPACING}>
            <Circle cx={SPACING / 2} cy={SPACING / 2} fill={palette.grid} r={1} />
          </Pattern>
        </Defs>
        <Rect fill="url(#drafting)" height="100%" width="100%" />
      </Svg>
    </View>
  );
}

/** Nothing to show yet: a tile on the drafting grid, a title, what would appear here. */
export function EmptyState(props: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** The product this page belongs to: colours the tile, like the dashboard's. */
  tone?: ProductTone;
}) {
  return (
    <View style={styles.empty}>
      <DraftingGrid />
      <View style={styles.tilePlate}>
        <ProductGlyph icon={props.icon} size={40} tone={props.tone ?? "neutral"} />
      </View>
      <Text style={styles.center} variant="heading">
        {props.title}
      </Text>
      {props.description ? (
        <Text muted style={styles.center} variant="small">
          {props.description}
        </Text>
      ) : null}
      {props.action ? <View style={styles.action}>{props.action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.xxl,
    paddingVertical: 40,
    borderRadius: radius.frame,
    overflow: "hidden",
  },
  tilePlate: {
    marginBottom: space.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
  },
  center: { textAlign: "center" },
  action: { marginTop: space.sm },
});
