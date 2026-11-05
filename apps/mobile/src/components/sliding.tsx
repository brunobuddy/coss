import { useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { cubicBezier, useReducedMotion } from "react-native-reanimated";
import { motion } from "../lib/theme";

const EASE = cubicBezier(0.2, 0.8, 0.2, 1);

/**
 * The dashboard's sliding highlight: an indicator under the selected item that appears in place,
 * then glides to the next one. Spread `onItemLayout(key)` on each item.
 *
 * A CSS transition over React's own style rather than shared values: those can be lost when a
 * screen re-attaches after a push, leaving the indicator under a previous item.
 */
export function useSlidingIndicator(selected: string) {
  const reduced = useReducedMotion();
  const [layouts, setLayouts] = useState<ReadonlyMap<string, { x: number; width: number }>>(
    () => new Map(),
  );
  const placed = useRef(false);
  const layout = layouts.get(selected);
  const animate = placed.current && !reduced;
  if (layout) placed.current = true;

  return {
    style: {
      width: layout?.width ?? 0,
      opacity: layout ? 1 : 0,
      transform: [{ translateX: layout?.x ?? 0 }],
      transitionProperty: ["transform", "width"],
      transitionDuration: animate ? motion.slide : 0,
      transitionTimingFunction: EASE,
    } as const,
    onItemLayout: (key: string) => (event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      setLayouts((current) => {
        const known = current.get(key);
        if (known?.x === x && known.width === width) return current;
        return new Map(current).set(key, { x, width });
      });
    },
  };
}
