import type { ProductKey } from "@coss/dashboard-routes";
import { DynamicColorIOS, type OpaqueColorValue, useColorScheme } from "react-native";

// coss ui's tokens (packages/ui/src/styles/theme.css), resolved to sRGB for light and `.dark`.
const light = {
  background: "#ffffff",
  foreground: "#262626",
  card: "#ffffff",
  /** The muted tray a panel's header and footer sit on (`bg-muted/72` over the card). */
  tray: "#f6f6f6",
  muted: "rgba(0,0,0,0.04)",
  mutedForeground: "#686868",
  border: "rgba(0,0,0,0.08)",
  input: "rgba(0,0,0,0.10)",
  primary: "#262626",
  primaryForeground: "#fafafa",
  sidebar: "#fafafa",
  /** `.drafting-grid` dots: the foreground at 16%. */
  grid: "rgba(38,38,38,0.16)",
  chartSent: "rgba(38,38,38,0.72)",
  /** `bg-foreground/32`: the Spend chart's personal keys. */
  chartLight: "rgba(38,38,38,0.32)",
  chartPending: "rgba(59,130,246,0.64)",
  chartCanceled: "rgba(104,104,104,0.32)",
  chartEmpty: "rgba(104,104,104,0.16)",
  success: "#10b981",
  successForeground: "#047857",
  successTint: "rgba(16,185,129,0.08)",
  successBorder: "rgba(16,185,129,0.32)",
  warning: "#f59e0b",
  warningForeground: "#b45309",
  warningTint: "rgba(245,158,11,0.08)",
  warningBorder: "rgba(245,158,11,0.32)",
  destructive: "#ef4444",
  destructiveForeground: "#b91c1c",
  destructiveTint: "rgba(239,68,68,0.06)",
  destructiveBorder: "rgba(239,68,68,0.32)",
  info: "#3b82f6",
  infoForeground: "#1d4ed8",
  infoTint: "rgba(59,130,246,0.08)",
  infoBorder: "rgba(59,130,246,0.32)",
};

type Palette = typeof light;

const dark: Palette = {
  background: "#161616",
  foreground: "#f5f5f5",
  card: "#1b1b1b",
  tray: "#1f1f1f",
  muted: "rgba(255,255,255,0.04)",
  mutedForeground: "#818181",
  border: "rgba(255,255,255,0.06)",
  input: "rgba(255,255,255,0.08)",
  primary: "#f5f5f5",
  primaryForeground: "#262626",
  sidebar: "#111111",
  grid: "rgba(245,245,245,0.16)",
  chartSent: "rgba(245,245,245,0.72)",
  chartLight: "rgba(245,245,245,0.32)",
  chartPending: "rgba(59,130,246,0.64)",
  chartCanceled: "rgba(129,129,129,0.32)",
  chartEmpty: "rgba(129,129,129,0.16)",
  success: "#10b981",
  successForeground: "#34d399",
  successTint: "rgba(16,185,129,0.16)",
  successBorder: "rgba(16,185,129,0.32)",
  warning: "#f59e0b",
  warningForeground: "#fbbf24",
  warningTint: "rgba(245,158,11,0.16)",
  warningBorder: "rgba(245,158,11,0.32)",
  destructive: "#f15757",
  destructiveForeground: "#f87171",
  destructiveTint: "rgba(239,68,68,0.12)",
  destructiveBorder: "rgba(239,68,68,0.32)",
  info: "#3b82f6",
  infoForeground: "#60a5fa",
  infoTint: "rgba(59,130,246,0.16)",
  infoBorder: "rgba(59,130,246,0.32)",
};

export type ColorToken = keyof Palette;

/** Native dynamic colors for styles: they follow the system appearance without re-rendering. */
export const colors = Object.fromEntries(
  Object.keys(light).map((key) => [
    key,
    DynamicColorIOS({ light: light[key as ColorToken], dark: dark[key as ColorToken] }),
  ]),
) as Record<ColorToken, OpaqueColorValue>;

/** Plain colors for what can't take a dynamic one (SVG icons, the status bar). */
export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export type Tone = "success" | "warning" | "error" | "info" | "neutral";

export const TONE_TOKENS: Record<
  Tone,
  { dot: ColorToken; text: ColorToken; tint: ColorToken; border: ColorToken }
> = {
  success: {
    dot: "success",
    text: "successForeground",
    tint: "successTint",
    border: "successBorder",
  },
  warning: {
    dot: "warning",
    text: "warningForeground",
    tint: "warningTint",
    border: "warningBorder",
  },
  error: {
    dot: "destructive",
    text: "destructiveForeground",
    tint: "destructiveTint",
    border: "destructiveBorder",
  },
  info: { dot: "info", text: "infoForeground", tint: "infoTint", border: "infoBorder" },
  neutral: { dot: "mutedForeground", text: "foreground", tint: "muted", border: "border" },
};

// Static instances cut from @coss/ui's Cal Sans and Paper Mono (scripts/build-fonts.py).
export const fonts = {
  regular: "CalSans-Regular",
  medium: "CalSans-Medium",
  semibold: "CalSans-SemiBold",
  display: "CalSans-Display",
  wordmark: "CalSans-Wordmark",
  mono: "PaperMono-Regular",
};

export const radius = { sm: 6, md: 8, lg: 10, xl: 14, frame: 16 };

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 };

/** The dashboard's motion vocabulary (`packages/ui/src/styles/globals.css`), at touch speed. */
export const motion = {
  spring: { damping: 26, stiffness: 320, mass: 0.8 },
  fast: 150,
  arrive: 240,
  count: 700,
  draw: 600,
};

/**
 * Light from above, as CSS gradients and shadows (RN takes both as style strings): raised things
 * catch light on top and sit on a heavier edge, wells are shaded just inside their top edge.
 */
const lightFinish = {
  primaryGradient: "linear-gradient(to bottom, rgba(255,255,255,0.16), rgba(255,255,255,0) 55%)",
  primaryEdge: "inset 0 1px 0 rgba(255,255,255,0.16), 0 1px 2px rgba(0,0,0,0.12)",
  keycapGradient: "linear-gradient(to bottom, rgba(38,38,38,0) 40%, rgba(38,38,38,0.035))",
  keycapEdge: "inset 0 1px 0 rgba(255,255,255,0.65), 0 1px 1px rgba(0,0,0,0.04)",
  keycapBottom: "rgba(0,0,0,0.24)",
  wellGradient: "linear-gradient(to bottom, rgba(38,38,38,0.035), rgba(38,38,38,0) 8px)",
  raised: "inset 0 1px 0 rgba(255,255,255,0.65), 0 1px 2px rgba(0,0,0,0.1)",
  tileEdge: "inset 0 1px 0 rgba(255,255,255,0.65)",
  panel: "0 1px 2px rgba(0,0,0,0.03)",
};

const darkFinish: typeof lightFinish = {
  primaryGradient: "linear-gradient(to bottom, rgba(255,255,255,0.16), rgba(255,255,255,0) 55%)",
  primaryEdge: "inset 0 1px 0 rgba(255,255,255,0.16), 0 1px 2px rgba(0,0,0,0.4)",
  keycapGradient: "linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(255,255,255,0) 60%)",
  keycapEdge: "inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 1px rgba(0,0,0,0.3)",
  keycapBottom: "rgba(255,255,255,0.08)",
  wellGradient: "linear-gradient(to bottom, rgba(0,0,0,0.22), rgba(0,0,0,0) 8px)",
  raised: "inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.4)",
  tileEdge: "inset 0 1px 0 rgba(255,255,255,0.1)",
  panel: "0 1px 2px rgba(0,0,0,0.2)",
};

export function useFinish(): typeof lightFinish {
  return useColorScheme() === "dark" ? darkFinish : lightFinish;
}

export type ProductTone = ProductKey | "neutral";

type ProductShades = {
  base: string;
  text: [light: string, dark: string];
  deep: [light: string, dark: string];
  /** Forms' amber needs a little more on its tile, as on the dashboard. */
  tile?: number;
  ring?: number;
};

// Tailwind's shades, resolved from oklch: apps/web/src/components/product-glyph.tsx.
const PRODUCT_SHADES: Record<ProductKey, ProductShades> = {
  email: { base: "255,105,0", text: ["#f54900", "#ff8904"], deep: ["#7e2a0c", "#ffd6a7"] },
  marketing: { base: "246,51,154", text: ["#e60076", "#fb64b6"], deep: ["#861043", "#fccee8"] },
  inboxes: { base: "142,81,255", text: ["#7f22fe", "#a684ff"], deep: ["#4d179a", "#ddd6ff"] },
  sms: { base: "0,188,125", text: ["#009966", "#00d492"], deep: ["#004f3b", "#a4f4cf"] },
  verify: { base: "0,166,244", text: ["#0084d1", "#00bcff"], deep: ["#024a70", "#b8e6fe"] },
  sign: { base: "97,95,255", text: ["#4f39f6", "#7c86ff"], deep: ["#312c85", "#c6d2ff"] },
  forms: {
    base: "254,154,0",
    text: ["#bb4d00", "#ffb900"],
    deep: ["#7b3306", "#fee685"],
    tile: 0.14,
    ring: 0.25,
  },
  scheduling: { base: "43,127,255", text: ["#155dfc", "#51a2ff"], deep: ["#1c398e", "#bedbff"] },
  hooks: { base: "0,187,167", text: ["#009689", "#00d5be"], deep: ["#0b4f4a", "#96f7e4"] },
  risk: { base: "255,32,86", text: ["#ec003f", "#ff637e"], deep: ["#8b0836", "#ffccd3"] },
};

function dynamic(light: string, dark: string): OpaqueColorValue {
  return DynamicColorIOS({ light, dark });
}

/** A product's colours for styles: its tile, ring, wash and text. */
export function productColors(tone: ProductTone) {
  if (tone === "neutral") {
    return {
      tile: colors.muted,
      ring: colors.border,
      wash: colors.muted,
      text: colors.mutedForeground,
      deep: colors.foreground,
      solid: colors.foreground,
    };
  }
  const shades = PRODUCT_SHADES[tone];
  const tile = `rgba(${shades.base},${shades.tile ?? 0.12})`;
  const ring = `rgba(${shades.base},${shades.ring ?? 0.2})`;
  const wash = `rgba(${shades.base},0.1)`;
  return {
    tile: dynamic(tile, tile),
    ring: dynamic(ring, ring),
    wash: dynamic(wash, wash),
    text: dynamic(shades.text[0], shades.text[1]),
    deep: dynamic(shades.deep[0], shades.deep[1]),
    solid: dynamic(`rgb(${shades.base})`, `rgb(${shades.base})`),
  };
}

/** A product's text colour as a plain string, for SVG icons. */
export function useProductText(tone: ProductTone): string {
  const scheme = useColorScheme();
  const palette = usePalette();
  if (tone === "neutral") return palette.mutedForeground;
  return PRODUCT_SHADES[tone].text[scheme === "dark" ? 1 : 0];
}
