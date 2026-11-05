import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors, space, TONE_TOKENS, type Tone } from "../lib/theme";
import { Text } from "./text";

/** coss ui's `Badge`: tinted for a status, or plain (`outline`, `secondary`). */
export function Badge(props: {
  variant?: Tone | "outline" | "secondary";
  mono?: boolean;
  children: ReactNode;
}) {
  const variant = props.variant ?? "secondary";
  const tone = variant === "outline" || variant === "secondary" ? null : TONE_TOKENS[variant];
  return (
    <View
      style={[
        styles.badge,
        variant === "outline" && styles.outline,
        variant === "secondary" && { backgroundColor: colors.muted },
        tone && { backgroundColor: colors[tone.tint] },
      ]}
    >
      {typeof props.children === "string" ? (
        <Text
          style={{ color: tone ? colors[tone.text] : colors.foreground }}
          variant={props.mono ? "mono" : "smallMedium"}
        >
          {props.children}
        </Text>
      ) : (
        props.children
      )}
    </View>
  );
}

/** A status as a coloured dot, with its label when given. */
export function StatusDot(props: { tone: Tone; label?: string; muted?: boolean }) {
  return (
    <View style={styles.status}>
      <View style={[styles.dot, { backgroundColor: colors[TONE_TOKENS[props.tone].dot] }]} />
      {props.label ? (
        <Text muted={props.muted} variant="small">
          {props.label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: space.sm,
    minHeight: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  outline: { borderColor: colors.input, backgroundColor: colors.background },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
