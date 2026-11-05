import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { type ProductTone, productColors, radius, useFinish, useProductText } from "../lib/theme";

/** The dashboard's `ProductGlyph`: a product's icon on a lit tile of its colour. */
export function ProductGlyph(props: { tone: ProductTone; icon: LucideIcon; size?: number }) {
  const size = props.size ?? 28;
  const shade = productColors(props.tone);
  const finish = useFinish();
  const color = useProductText(props.tone);
  const Glyph = props.icon;
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size >= 36 ? radius.xl - 2 : radius.md,
          backgroundColor: shade.tile,
          borderColor: shade.ring,
          boxShadow: finish.tileEdge,
        },
      ]}
    >
      <Glyph color={color} size={Math.round(size * 0.55)} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
