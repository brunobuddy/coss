"use client";

import { useEffect, useRef, useState } from "react";

const NUMBER = /^(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(.*)$/;

/**
 * A figure ("12,480", "41.2%", "1.2k") that counts up from zero when it first appears, and from
 * its previous value when it changes, keeping its format; anything else (a dash) shows as it is.
 * Still under `prefers-reduced-motion`.
 */
export function CountUp(props: { value: string; durationMs?: number }) {
  const [display, setDisplay] = useState(props.value);
  const shown = useRef(0);

  useEffect(() => {
    const match = NUMBER.exec(props.value);
    if (!match?.[1] || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(props.value);
      return;
    }
    const digits = match[1];
    const suffix = match[2] ?? "";
    const target = Number(digits.replaceAll(",", ""));
    const decimals = digits.split(".")[1]?.length ?? 0;
    const grouped = digits.includes(",");
    const format = (value: number) =>
      `${value.toLocaleString("en", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: grouped,
      })}${suffix}`;
    const from = shown.current;
    if (from === target) {
      setDisplay(props.value);
      return;
    }
    const duration = props.durationMs ?? 700;
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      shown.current = from + (target - from) * (1 - (1 - progress) ** 3);
      setDisplay(progress < 1 ? format(shown.current) : props.value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [props.value, props.durationMs]);

  return <span className="tabular-nums">{display}</span>;
}
