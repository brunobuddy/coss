"use client";
import { Button } from "@coss/ui/components/button";
import { cn } from "@coss/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { Children, isValidElement, type ReactNode, useState } from "react";

/** Rows shown before "Show all": the first are the ones worth deciding on. */
const VISIBLE = 6;

/** Opens a list that starts from its first rows. One control, everywhere a list collapses. */
export function ShowAll({
  open,
  count,
  noun = "rows",
  onToggle,
  className,
}: {
  open: boolean;
  count: number;
  noun?: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex justify-center border-t p-3", className)}>
      <Button aria-expanded={open} onClick={onToggle} size="sm" variant="ghost">
        <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
        {open ? `Show fewer ${noun}` : `Show all ${count} ${noun}`}
      </Button>
    </div>
  );
}

/**
 * Label and value rows, two columns from `md`: limits, copied from the source. A long list opens
 * from its first few; the rest stay in the page for crawlers and answer engines.
 */
export function Facts({ children }: { children: ReactNode }) {
  const count = Children.toArray(children).filter(isValidElement).length;
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <dl
        className={cn(
          "grid gap-x-12 md:grid-cols-2 [&>div]:border-t max-md:[&>div:first-child]:border-t-0 md:[&>div:nth-child(-n+2)]:border-t-0",
          !open && "[&>div:nth-child(n+7)]:hidden",
        )}
      >
        {children}
      </dl>
      {count > VISIBLE ? (
        <ShowAll
          className="-mx-4 -mb-4 mt-3 sm:-mx-5 sm:-mb-5"
          count={count}
          noun="limits"
          onToggle={() => setOpen((value) => !value)}
          open={open}
        />
      ) : null}
    </div>
  );
}
