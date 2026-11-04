"use client";
import { Badge } from "@coss/ui/components/badge";
import { cn } from "@coss/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { BEAT } from "./beat";

/*
 * The product's interface on the marketing pages: small working pieces built like the dashboard's.
 * Their data is made up for the demo; event names and statuses are real.
 */

export type Tone = "success" | "warning" | "error" | "info" | "neutral";

const DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground/56",
};

/** A status as a coloured dot and its label: the dashboard's `StatusDot`. */
export function StatusDot({
  tone,
  pulse,
  className,
  children,
}: {
  tone: Tone;
  pulse?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          DOT[tone],
          pulse && "motion-safe:animate-pulse",
        )}
      />
      {children}
    </span>
  );
}

export interface TraceEvent {
  /** The real event or status name. */
  name: string;
  tone: Tone;
  /** A sample time, shown as it arrives. */
  at: string;
  detail?: string;
}

/** Events in the order they arrive, each rising in after the last. */
export function EventList({
  events,
  step = 180,
}: {
  events: readonly TraceEvent[];
  step?: number;
}) {
  return (
    <ol className="flex flex-col">
      {events.map((event, index) => (
        <li
          className="enter-rise grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b py-2.5 last:border-b-0"
          key={event.name}
          style={{ animationDelay: `${index * step}ms` }}
        >
          <StatusDot
            className="min-w-0 whitespace-normal font-mono text-[0.8125rem] [overflow-wrap:anywhere]"
            tone={event.tone}
          >
            {event.name}
          </StatusDot>
          <time className="font-mono text-muted-foreground text-xs tabular-nums">{event.at}</time>
          {event.detail ? (
            <span className="col-span-2 ps-3 text-muted-foreground text-xs">{event.detail}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * Restarts its children's CSS animations when they first scroll into view. They already run on
 * first paint (so a stage above the fold never flashes) and when a hidden tab is shown; anything
 * below the fold is out of sight when they do, so it plays again here. Everything is visible without
 * script, and nothing moves under reduced motion.
 */
export function Play({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    if (box.height > 0 && box.top < window.innerHeight && box.bottom > 0) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setRun((value) => value + 1);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div className={className} key={run} ref={ref}>
      {children}
    </div>
  );
}

/** A status that moves on with each beat, ending on the last. */
export function ProgressBadge({
  steps,
  step = BEAT,
}: {
  steps: readonly { label: string; variant: ComponentProps<typeof Badge>["variant"] }[];
  step?: number;
}) {
  const last = steps[steps.length - 1];
  return (
    <span className="grid shrink-0 justify-items-end [&>*]:[grid-area:1/1]">
      {steps.map((item, index) => (
        <span
          aria-hidden={item !== last}
          className={item === last ? "status-last" : "status-step"}
          key={item.label}
          style={{
            animationDelay: `${index * step}ms`,
            animationDuration: item === last ? undefined : `${step}ms`,
          }}
        >
          <Badge variant={item.variant}>{item.label}</Badge>
        </span>
      ))}
    </span>
  );
}

/** Events arriving one beat apart, under whatever they belong to. */
export function Replay({
  events,
  step = BEAT,
  children,
}: {
  events: readonly TraceEvent[];
  step?: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {children}
      <EventList events={events} step={step} />
    </div>
  );
}
