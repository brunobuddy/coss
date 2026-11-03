import { useEffect } from "react";

/** The customer's accent color: `#RRGGBB`, checked when it was set. */
export function useAccentColor(color: string | null | undefined): void {
  useEffect(() => {
    if (color) document.documentElement.style.setProperty("--primary", color);
  }, [color]);
}
