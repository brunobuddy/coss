"use client";

import { cn } from "@coss/ui/lib/utils";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActiveIndicator, useActiveIndicator } from "./shell/active-indicator";

/**
 * A segmented row of filter links (status: all / sent / failed…) whose pill slides to the chosen
 * option as soon as it's clicked. Plain links, so it works without JavaScript.
 */
export function FilterLinks(props: {
  options: { value: string; label: string; href: string }[];
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
        "relative flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-lg bg-muted bg-linear-to-b from-foreground/2.5 to-0.375rem to-transparent p-0.5 dark:from-black/15",
        props.className,
      )}
      ref={track}
    >
      <ActiveIndicator
        {...indicator}
        className="rounded-md bg-background bg-linear-to-b from-50% from-transparent to-foreground/2 shadow-[0_1px_2px_--theme(--color-black/6%)] inset-shadow-[0_1px_--theme(--color-white/50%)] dark:bg-input dark:from-white/3 dark:to-transparent dark:inset-shadow-[0_1px_--theme(--color-white/5%)]"
      />
      {props.options.map((option) => {
        const active = option.value === value;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-7 shrink-0 items-center rounded-md px-2.5 text-sm transition-colors",
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
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
