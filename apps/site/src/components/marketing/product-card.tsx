import { cn } from "@coss/ui/lib/utils";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { ProductTile } from "./kit";
import { PREVIEWS } from "./previews";

/** A product as a link: its tile, name and one line, and a piece of its interface when it has one. */
export function ProductCard({
  slug,
  href,
  title,
  call,
  lede,
  preview,
  className,
}: {
  slug: string;
  href: string;
  title: string;
  call?: string;
  lede: string;
  preview?: boolean;
  className?: string;
}) {
  const piece = preview ? PREVIEWS[slug] : null;
  // Without a piece of its interface a product is one line: its tile and name, not a paragraph.
  if (!piece) {
    return (
      <Link
        className={cn(
          "group flex min-w-0 items-center gap-3 rounded-xl border bg-card px-3.5 py-3 shadow-xs/5 transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
        href={href}
      >
        <ProductTile size="sm" slug={slug} />
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <ArrowRightIcon
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    );
  }
  return (
    <Link
      className={cn(
        "group flex h-full min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs/5 transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
      href={href}
    >
      <span className="flex items-center gap-3">
        <ProductTile slug={slug} />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 font-heading font-semibold text-lg leading-tight tracking-[-0.01em]">
            {title}
            <ArrowRightIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            />
          </span>
          {call ? (
            <code className="truncate font-mono text-muted-foreground text-xs">{call}</code>
          ) : null}
        </span>
      </span>
      <span className="text-pretty text-muted-foreground leading-snug">{lede}</span>
      {piece ? (
        <span aria-hidden className="mt-auto block rounded-xl bg-muted/64 p-3">
          {piece}
        </span>
      ) : null}
    </Link>
  );
}
