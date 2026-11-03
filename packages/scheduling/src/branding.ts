/** What pages and emails share about a customer's branding. No imports: browsers load this. */

export const LOGO_MAX_BYTES = 200_000;

const INK = "#18181b";
const WHITE = "#ffffff";
// Below this, a button or a chosen day disappears into a white page.
const MIN_CONTRAST_WITH_PAGE = 1.3;
const READABLE = 4.5;

function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** A `#RRGGBB` and the text that reads on it, or `null` for one a white page would hide. */
export function accentColors(hex: string): { background: string; foreground: string } | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const own = luminance(hex);
  const onWhite = contrast(own, 1);
  if (onWhite < MIN_CONTRAST_WITH_PAGE) return null;
  const onInk = contrast(own, luminance(INK));
  return { background: hex, foreground: onWhite >= READABLE || onWhite >= onInk ? WHITE : INK };
}
