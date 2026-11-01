import { cn } from "@coss/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ToneTile } from "./tone-tile";

const TILE_SHAPE =
  "size-10 rounded-xl shadow-[0_1px_2px_--theme(--color-black/6%)] dark:shadow-[0_1px_2px_--theme(--color-black/40%)]";

/**
 * What a dialog is about, beside its title: the first child of a `DialogHeader` or
 * `AlertDialogHeader`, which then lays out as icon + text. In the page's product colour, or red for
 * a destructive confirmation.
 */
export function DialogIcon(props: { icon: LucideIcon; tone?: "danger" }) {
  const Icon = props.icon;
  const glyph = <Icon className="size-5" strokeWidth={1.75} />;
  return (
    <span aria-hidden data-slot="dialog-icon">
      {props.tone === "danger" ? (
        <span
          className={cn(
            "flex items-center justify-center bg-destructive/10 text-destructive ring-1 ring-destructive/20 ring-inset inset-shadow-[0_1px_--theme(--color-white/65%)] dark:inset-shadow-[0_1px_--theme(--color-white/10%)]",
            TILE_SHAPE,
          )}
        >
          {glyph}
        </span>
      ) : (
        <ToneTile className={TILE_SHAPE}>{glyph}</ToneTile>
      )}
    </span>
  );
}
