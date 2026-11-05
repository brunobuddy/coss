import { cn } from "@coss/ui/lib/utils";
import type { ReactNode } from "react";
import { PageGlyph } from "./page-glyph";

/**
 * A page's title row: the heading in the site's display type, an optional description and `meta`
 * line (badges, a mono id), and the page's actions on the right.
 */
export function PageHeader(props: {
  title: ReactNode;
  description?: ReactNode;
  /** Shown under the title: status badges, a mono id with its copy button… */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", props.className)}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <PageGlyph />
          <h1 className="min-w-0 text-balance font-heading font-semibold text-2xl tracking-[-0.02em] sm:text-[1.75rem] sm:leading-tight">
            {props.title}
          </h1>
        </div>
        {props.description ? (
          <p className="max-w-2xl text-muted-foreground text-sm">{props.description}</p>
        ) : null}
        {props.meta ? (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-muted-foreground text-sm">
            {props.meta}
          </div>
        ) : null}
      </div>
      {props.actions ? (
        <div className="flex flex-wrap items-center gap-2">{props.actions}</div>
      ) : null}
    </div>
  );
}
