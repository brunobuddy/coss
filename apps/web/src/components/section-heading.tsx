import type { ReactNode } from "react";

/** A heading over a group of a page's content (smaller than the page's own). */
export function SectionHeading(props: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-heading font-semibold text-lg">{props.title}</h2>
        {props.description ? (
          <p className="text-muted-foreground text-sm">{props.description}</p>
        ) : null}
      </div>
      {props.action}
    </div>
  );
}
