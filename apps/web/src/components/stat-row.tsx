import { cn } from "@coss/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

/** A row of measured values, ruled into cells like coss.com's figures (2 columns, 4 from `lg`). */
export function StatRow(props: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border shadow-xs/5 lg:grid-cols-4",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

export function Stat(props: {
  label: ReactNode;
  value: ReactNode;
  /** A unit or qualifier after the value ("%", "/ 7 d"). */
  unit?: ReactNode;
  /** A mono line under the value: a rate, a comparison. */
  detail?: ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="label-caps text-muted-foreground">{props.label}</div>
      <div className="flex items-baseline gap-1">
        <span className="font-heading font-semibold text-3xl tabular-nums tracking-[-0.02em]">
          {props.value}
        </span>
        {props.unit ? <span className="text-lg text-muted-foreground">{props.unit}</span> : null}
      </div>
      {props.detail ? (
        <div className="truncate font-mono text-muted-foreground text-xs">{props.detail}</div>
      ) : null}
    </>
  );
  const className = cn("flex min-w-0 flex-col gap-1.5 bg-card px-5 py-4", props.className);
  return props.href ? (
    <Link className={cn(className, "transition-colors hover:bg-accent/40")} href={props.href}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
