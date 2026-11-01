import { Card } from "@coss/ui/components/card";
import { Table } from "@coss/ui/components/table";
import { cn } from "@coss/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * Settings pages are a narrow column of sections: a heading (and a line of explanation) above one
 * card of `SettingsRow`s, optionally closed by a `SettingsFooter` with the section's save button.
 * A card can also hold a `SettingsTable`, an `EmptyState compact` or a `SettingsNote`; whatever it
 * holds starts with a top rule (`border-t`), which the card tucks under its edge.
 */
export function SettingsPage(props: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex max-w-4xl flex-col gap-10", props.className)}>{props.children}</div>
  );
}

export function SettingsSection(props: {
  /** Leave it out for a page's first section when the page title already names it. */
  title?: ReactNode;
  description?: ReactNode;
  /** A button or two on the heading's right (add, export, compare plans). */
  action?: ReactNode;
  /** `danger` rules the card in the destructive tone (leaving, deleting). */
  tone?: "danger";
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex scroll-mt-20 flex-col gap-3" id={props.id}>
      {props.title || props.description || props.action ? (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            {props.title ? (
              <h2 className="flex items-center gap-2 font-heading font-semibold text-base tracking-[-0.01em]">
                {props.title}
              </h2>
            ) : null}
            {props.description ? (
              <p className="max-w-2xl text-pretty text-muted-foreground text-sm">
                {props.description}
              </p>
            ) : null}
          </div>
          {props.action ? (
            <div className="flex shrink-0 items-center gap-2">{props.action}</div>
          ) : null}
        </div>
      ) : null}
      <Card className={cn("overflow-hidden", props.tone === "danger" && "border-destructive/24")}>
        {/* Every row draws its top rule (rows may sit inside forms); -mt-px tucks the first one
            under the card's edge. */}
        <div className="-mt-px">{props.children}</div>
      </Card>
    </section>
  );
}

/**
 * One setting: its name and a short explanation on the left, the control on the right, centred
 * on the row (stacked on small screens). `stacked` puts the control under the label at full
 * width, for long values (URLs to copy) and wide controls (lists, multi-line inputs). Rows are
 * ruled by hairlines.
 */
export function SettingsRow(props: {
  label: ReactNode;
  description?: ReactNode;
  /** Shown before the label and description (an avatar, a logo). */
  media?: ReactNode;
  stacked?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  if (props.stacked) {
    return (
      <div className={cn("flex flex-col gap-3 border-t px-5 py-4", props.className)}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2 font-medium text-sm">{props.label}</div>
          {props.description ? (
            <div className="max-w-xl text-pretty text-muted-foreground text-sm">
              {props.description}
            </div>
          ) : null}
        </div>
        {props.children ? <div className="min-w-0 text-sm">{props.children}</div> : null}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-10",
        props.className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        {props.media}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2 font-medium text-sm">{props.label}</div>
          {props.description ? (
            <div className="max-w-md text-pretty text-muted-foreground text-sm">
              {props.description}
            </div>
          ) : null}
        </div>
      </div>
      {props.children ? (
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 text-sm">
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

/** The bottom bar of a section's card: a status or hint on the left, the save button on the right. */
export function SettingsFooter(props: { hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-t bg-muted/40 px-5 py-2.5">
      <div className="min-w-0 text-muted-foreground text-sm">{props.hint}</div>
      {props.children ? (
        <div className="flex shrink-0 items-center gap-2">{props.children}</div>
      ) : null}
    </div>
  );
}

/**
 * A table inside a section's card: coss ui's plain table, its outer cells padded to line up with
 * the rows'. Children are the usual `TableHeader`/`TableBody`.
 */
export function SettingsTable(props: { className?: string; children: ReactNode }) {
  return (
    <div className="border-t">
      <Table
        className={cn(
          "[&_td:first-child]:ps-5 [&_td:last-child]:pe-5 [&_th:first-child]:ps-5 [&_th:last-child]:pe-5",
          props.className,
        )}
      >
        {props.children}
      </Table>
    </div>
  );
}

/** Free text inside a section's card (a status line, requirements, a short list), padded like a row. */
export function SettingsNote(props: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("border-t px-5 py-4 text-muted-foreground text-sm", props.className)}>
      {props.children}
    </div>
  );
}
