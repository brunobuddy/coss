"use client";

import { cn } from "@coss/ui/lib/utils";
import { useState } from "react";

export type BarSeries = {
  key: string;
  label: string;
  /** Background class of the bar segment and the legend dot. */
  className: string;
};

export type BarColumn = {
  /** Axis and tooltip label ("Oct 14"). */
  label: string;
  values: Record<string, number>;
};

const count = new Intl.NumberFormat("en");
const dollars = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

/** How values read: counts, or cents shown as dollars. */
export type BarUnit = "count" | "cents";

function formatValue(value: number, unit: BarUnit): string {
  return unit === "cents" ? dollars.format(value / 100) : count.format(value);
}

/**
 * Columns of stacked bars (first series at the bottom) with a legend, a top gridline at the
 * maximum and a tooltip on hover. Plain HTML so bars stay crisp at any width.
 */
export function StackedBars(props: {
  series: BarSeries[];
  columns: BarColumn[];
  className?: string;
  /** Accessible summary of what the chart shows. */
  label: string;
  unit?: BarUnit;
}) {
  const unit = props.unit ?? "count";
  const [hover, setHover] = useState<number | null>(null);
  const totals = props.columns.map((column) =>
    props.series.reduce((sum, series) => sum + (column.values[series.key] ?? 0), 0),
  );
  const max = Math.max(1, ...totals);
  const hovered = hover === null ? null : props.columns[hover];
  const first = props.columns[0];
  const last = props.columns.at(-1);

  return (
    <div className={cn("flex flex-col gap-3", props.className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
        {props.series.map((series) => (
          <span className="inline-flex items-center gap-1.5" key={series.key}>
            <span className={cn("size-2 rounded-[2px]", series.className)} />
            {series.label}
          </span>
        ))}
        <span className="ms-auto font-mono tabular-nums">max {formatValue(max, unit)}</span>
      </div>
      <div className="relative">
        <div
          aria-label={props.label}
          className="relative flex h-40 items-end gap-[3px] border-b border-dashed pt-px"
          onPointerLeave={() => setHover(null)}
          role="img"
        >
          <div aria-hidden className="absolute inset-x-0 top-0 border-t border-dashed" />
          {props.columns.map((column, index) => (
            <div
              className="flex h-full min-w-0 flex-1 flex-col-reverse"
              key={column.label}
              onPointerEnter={() => setHover(index)}
              style={{ opacity: hover === null || hover === index ? 1 : 0.5 }}
            >
              {totals[index] === 0 ? (
                <div className="h-0.5 rounded-[1px] bg-muted-foreground/16" />
              ) : (
                props.series.map((series) => {
                  const value = column.values[series.key] ?? 0;
                  if (value === 0) return null;
                  return (
                    <div
                      className={cn(
                        "min-h-0.5 bg-linear-to-b from-white/14 to-transparent first:rounded-b-[2px] last:rounded-t-[2px] last:inset-shadow-[0_1px_--theme(--color-white/35%)]",
                        series.className,
                      )}
                      key={series.key}
                      style={{ height: `${(value / max) * 100}%` }}
                    />
                  );
                })
              )}
            </div>
          ))}
        </div>
        {hovered && hover !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 -translate-y-[calc(100%+0.5rem)] rounded-lg border bg-popover px-2.5 py-2 text-popover-foreground text-xs shadow-md/5"
            style={{
              left: `clamp(4.5rem, ${((hover + 0.5) / props.columns.length) * 100}%, calc(100% - 4.5rem))`,
            }}
          >
            <div className="mb-1.5 font-mono text-muted-foreground">{hovered.label}</div>
            {[...props.series].reverse().map((series) => (
              <div className="flex items-center gap-2" key={series.key}>
                <span className={cn("size-2 rounded-[2px]", series.className)} />
                <span className="flex-1">{series.label}</span>
                <span className="font-mono tabular-nums">
                  {formatValue(hovered.values[series.key] ?? 0, unit)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>{first?.label}</span>
        <span>{last?.label}</span>
      </div>
    </div>
  );
}
