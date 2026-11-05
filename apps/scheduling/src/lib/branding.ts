import { accentColors } from "@coss/scheduling/branding";
import { useEffect } from "react";

export type Logo = { data_url: string; width: number; height: number };

export type Branding = {
  brand_name: string | null;
  accent_color: string | null;
  logo: Logo | null;
  /** The plan shows "Scheduling by coss.com" on its pages. */
  coss_attribution?: boolean;
};

/** The customer's accent color, with text that reads on it. A white page would hide a pale one. */
export function useAccentColor(color: string | null | undefined): void {
  useEffect(() => {
    const colors = color ? accentColors(color) : null;
    if (!colors) return;
    const { style } = document.documentElement;
    style.setProperty("--primary", colors.background);
    style.setProperty("--primary-foreground", colors.foreground);
    style.setProperty("--ring", colors.background);
  }, [color]);
}
