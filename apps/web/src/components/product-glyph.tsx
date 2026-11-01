import type { ProductKey } from "@coss/dashboard-routes";
import { cn } from "@coss/ui/lib/utils";
import type { LucideIcon } from "lucide-react";

export type GlyphTone = ProductKey | "neutral";

/** Each product's colour: its icon tile everywhere it appears, and its rail icon while open. */
const TILE: Record<GlyphTone, string> = {
  email: "bg-orange-500/12 text-orange-600 ring-orange-500/20 dark:text-orange-400",
  marketing: "bg-pink-500/12 text-pink-600 ring-pink-500/20 dark:text-pink-400",
  inboxes: "bg-violet-500/12 text-violet-600 ring-violet-500/20 dark:text-violet-400",
  sms: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
  verify: "bg-sky-500/12 text-sky-600 ring-sky-500/20 dark:text-sky-400",
  sign: "bg-indigo-500/12 text-indigo-600 ring-indigo-500/20 dark:text-indigo-400",
  forms: "bg-amber-500/14 text-amber-700 ring-amber-500/25 dark:text-amber-400",
  hooks: "bg-teal-500/12 text-teal-600 ring-teal-500/20 dark:text-teal-400",
  risk: "bg-rose-500/12 text-rose-600 ring-rose-500/20 dark:text-rose-400",
  neutral: "bg-muted text-muted-foreground ring-border",
};

export const PRODUCT_TEXT: Record<ProductKey, string> = {
  email: "text-orange-600 dark:text-orange-400",
  marketing: "text-pink-600 dark:text-pink-400",
  inboxes: "text-violet-600 dark:text-violet-400",
  sms: "text-emerald-600 dark:text-emerald-400",
  verify: "text-sky-600 dark:text-sky-400",
  sign: "text-indigo-600 dark:text-indigo-400",
  forms: "text-amber-700 dark:text-amber-400",
  hooks: "text-teal-600 dark:text-teal-400",
  risk: "text-rose-600 dark:text-rose-400",
};

/** The sidebar's sliding highlight while a product is open: a faint wash of its colour. */
export const PRODUCT_WASH: Record<ProductKey, string> = {
  email: "bg-orange-500/10",
  marketing: "bg-pink-500/10",
  inboxes: "bg-violet-500/10",
  sms: "bg-emerald-500/10",
  verify: "bg-sky-500/10",
  sign: "bg-indigo-500/10",
  forms: "bg-amber-500/12",
  hooks: "bg-teal-500/10",
  risk: "bg-rose-500/10",
};

/** The open page's label on that wash: the product's darkest shade (lightest in dark mode). */
export const PRODUCT_ACTIVE_TEXT: Record<ProductKey, string> = {
  email: "data-[active=true]:text-orange-900 dark:data-[active=true]:text-orange-200",
  marketing: "data-[active=true]:text-pink-900 dark:data-[active=true]:text-pink-200",
  inboxes: "data-[active=true]:text-violet-900 dark:data-[active=true]:text-violet-200",
  sms: "data-[active=true]:text-emerald-900 dark:data-[active=true]:text-emerald-200",
  verify: "data-[active=true]:text-sky-900 dark:data-[active=true]:text-sky-200",
  sign: "data-[active=true]:text-indigo-900 dark:data-[active=true]:text-indigo-200",
  forms: "data-[active=true]:text-amber-900 dark:data-[active=true]:text-amber-200",
  hooks: "data-[active=true]:text-teal-900 dark:data-[active=true]:text-teal-200",
  risk: "data-[active=true]:text-rose-900 dark:data-[active=true]:text-rose-200",
};

/** A product's icon on a tile of its colour. */
export function ProductGlyph(props: { tone: GlyphTone; icon: LucideIcon; className?: string }) {
  const Icon = props.icon;
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset inset-shadow-[0_1px_--theme(--color-white/65%)] dark:inset-shadow-[0_1px_--theme(--color-white/10%)]",
        TILE[props.tone],
        props.className,
      )}
    >
      <Icon className="size-[55%]" strokeWidth={2} />
    </span>
  );
}
