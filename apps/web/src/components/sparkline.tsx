import { cn } from "@coss/ui/lib/utils";

/**
 * A small line of recent values (oldest first) in the current text colour, over a soft fill.
 * `id` names its gradient, so it must be unique on the page.
 */
export function Sparkline(props: { id: string; values: number[]; className?: string }) {
  const width = 100;
  const height = 32;
  const max = Math.max(1, ...props.values);
  const step = props.values.length > 1 ? width / (props.values.length - 1) : width;
  const points = props.values.map((value, index) => [
    index * step,
    height - 2 - (value / max) * (height - 6),
  ]);
  const line = points
    .map(([x, y], index) => `${index ? "L" : "M"}${x?.toFixed(2)},${y?.toFixed(2)}`)
    .join(" ");
  const gradient = `sparkline-${props.id}`;
  return (
    <svg
      aria-hidden
      className={cn("h-8 w-full overflow-visible", props.className)}
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gradient})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
