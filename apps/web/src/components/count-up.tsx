"use client";

import { useEffect, useState } from "react";

const NUMBER = /^(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(.*)$/;

/**
 * A figure ("12,480", "41.2%", "1.2k") that counts up from zero when it first appears, keeping its
 * format; anything else (a dash) shows as it is. Still under `prefers-reduced-motion`.
 */
export function CountUp(props: { value: string; durationMs?: number }) {
  const [display, setDisplay] = useState(props.value);

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
    const duration = props.durationMs ?? 700;
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      setDisplay(format(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [props.value, props.durationMs]);

  return <span className="tabular-nums">{display}</span>;
}
