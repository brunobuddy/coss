import { useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { motion } from "../lib/theme";

/**
 * The dashboard's sliding highlight: an indicator under the selected item that appears in place,
 * then springs to the next one. Spread `onItemLayout(key)` on each item.
 */
export function useSlidingIndicator(selected: string) {
  const reduced = useReducedMotion();
  const layouts = useRef(new Map<string, { x: number; width: number }>());
  const [measured, setMeasured] = useState(0);
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const placed = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `measured` is when a layout arrived.
  useEffect(() => {
    const layout = layouts.current.get(selected);
    if (!layout) return;
    if (!placed.current || reduced) {
      placed.current = true;
      x.value = layout.x;
      width.value = layout.width;
      return;
    }
    x.value = withSpring(layout.x, motion.spring);
    width.value = withSpring(layout.width, motion.spring);
  }, [selected, measured, reduced, x, width]);

  const style = useAnimatedStyle(() => ({
    width: width.value,
    transform: [{ translateX: x.value }],
    opacity: width.value > 0 ? 1 : 0,
  }));

  return {
    style,
    onItemLayout: (key: string) => (event: LayoutChangeEvent) => {
      const { x: left, width: size } = event.nativeEvent.layout;
      layouts.current.set(key, { x: left, width: size });
      setMeasured((count) => count + 1);
    },
  };
}
