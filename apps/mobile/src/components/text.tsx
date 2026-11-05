import { Text as NativeText, type TextProps, type TextStyle } from "react-native";
import { colors, fonts } from "../lib/theme";

const VARIANTS = {
  /** A page title in the display drawing (`font-heading text-[1.75rem] tracking-[-0.02em]`). */
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.56 },
  /** A panel title (`font-heading text-[0.9375rem] tracking-[-0.01em]`). */
  heading: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.15 },
  /** A measured value (`font-heading text-3xl tabular-nums tracking-[-0.02em]`). */
  value: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
    fontVariant: ["tabular-nums"],
  },
  /** The dashboard's `label-caps`: the one voice of small labels over figures and groups. */
  caps: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.66,
    textTransform: "uppercase",
  },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallMedium: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  /** Ids, timestamps, slugs and measured details. */
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 17 },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof VARIANTS;

export function Text({
  variant = "body",
  muted,
  style,
  ...props
}: TextProps & { variant?: TextVariant; muted?: boolean }) {
  return (
    <NativeText
      {...props}
      style={[
        VARIANTS[variant],
        { color: muted ? colors.mutedForeground : colors.foreground },
        style,
      ]}
    />
  );
}

/** Inline code inside running text (the dashboard's `<code>`). */
export function Code(props: { children: string }) {
  return (
    <NativeText style={{ fontFamily: fonts.mono, fontSize: 12.5 }}>{props.children}</NativeText>
  );
}
