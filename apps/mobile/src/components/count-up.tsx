import { useEffect, useRef, useState } from "react";
import type { TextProps } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { motion } from "../lib/theme";
import { useArrival } from "./screen";
import { Text, type TextVariant } from "./text";

const NUMBER = /^(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(.*)$/;

/**
 * The dashboard's `CountUp` (`apps/web/src/components/count-up.tsx`): a figure keeps its format
 * ("12,480", "41.2%", "1.2k") while counting. It counts from zero only when it replaced a
 * skeleton, and from its last value when it changes; a cached page paints the figure at once.
 */
export function CountUp(
  props: { value: string; variant?: TextVariant; muted?: boolean } & TextProps,
) {
  const { value, variant, muted, ...text } = props;
  const reduced = useReducedMotion();
  const arrived = useArrival();
  const parse = (input: string) => {
    const match = NUMBER.exec(input);
    return match?.[1] ? Number(match[1].replaceAll(",", "")) : null;
  };
  const shown = useRef(arrived ? 0 : (parse(value) ?? 0));
  const [display, setDisplay] = useState(() => {
    const match = NUMBER.exec(value);
    return arrived && !reduced && match?.[1] ? `0${match[2] ?? ""}` : value;
  });

  useEffect(() => {
    const match = NUMBER.exec(value);
    if (!match?.[1] || reduced) {
      setDisplay(value);
      return;
    }
    const digits = match[1];
    const suffix = match[2] ?? "";
    const target = Number(digits.replaceAll(",", ""));
    const decimals = digits.split(".")[1]?.length ?? 0;
    const grouped = digits.includes(",");
    const format = (current: number) =>
      `${current.toLocaleString("en", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: grouped,
      })}${suffix}`;
    const from = shown.current;
    if (from === target) {
      setDisplay(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / motion.count);
      shown.current = from + (target - from) * (1 - (1 - progress) ** 3);
      setDisplay(progress < 1 ? format(shown.current) : value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return (
    <Text
      {...text}
      accessibilityLabel={value}
      muted={muted}
      style={[{ fontVariant: ["tabular-nums"] }, text.style]}
      variant={variant}
    >
      {display}
    </Text>
  );
}
