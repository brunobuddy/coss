"use client";

import { cn } from "@coss/ui/lib/utils";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActiveIndicator, useActiveIndicator } from "./shell/active-indicator";
import { STATUS_TONE_BACKGROUND, type StatusTone } from "./status-dot";

/**
 * A segmented row of filter links (status: all / sent / failed…): a recessed track whose raised
 * pill slides to the chosen option as soon as it's clicked. Plain links, so it works without
 * JavaScript; `tone` puts a status dot before an option's label.
 */
export function FilterLinks(props: {
  options: { value: string; label: string; href: string; tone?: StatusTone }[];
  value: string;
  className?: string;
}) {
  const track = useRef<HTMLElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new value ends the navigation.
  useEffect(() => setPending(null), [props.value]);
  const value = pending ?? props.value;
  const indicator = useActiveIndicator(track, value, '[aria-current="page"]');

  return (
    <nav
      aria-label="Filter"
      className={cn(
        "relative flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-lg bg-muted bg-linear-to-b from-foreground/5 to-0.5rem to-transparent p-0.5 inset-ring-1 inset-ring-foreground/6 dark:from-black/25",
        props.className,
      )}
      ref={track}
    >
      <ActiveIndicator
        {...indicator}
        className="rounded-md bg-background bg-linear-to-b from-40% from-transparent to-foreground/4 shadow-[0_1px_2px_--theme(--color-black/10%)] inset-shadow-[0_1px_--theme(--color-white/70%)] dark:bg-input dark:from-white/6 dark:to-transparent dark:inset-shadow-[0_1px_--theme(--color-white/8%)]"
      />
      {props.options.map((option) => {
        const active = option.value === value;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors",
              active
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
              // Before the indicator has measured (first paint, no JavaScript), the link draws it.
              active && !indicator.rect && "bg-background shadow-sm/5 dark:bg-input",
            )}
            href={option.href}
            key={option.value}
            onNavigate={() => setPending(option.value)}
          >
            {option.tone ? (
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full transition-opacity",
                  STATUS_TONE_BACKGROUND[option.tone],
                  !active && "opacity-60",
                )}
              />
            ) : null}
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
