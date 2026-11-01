import type { Product } from "@coss/dashboard-routes";
import { cn } from "@coss/ui/lib/utils";
import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_ICONS } from "@/lib/navigation";
import { ProductGlyph } from "./product-glyph";

/**
 * Products as cells of one ruled sheet (like coss.com's catalog): hairlines between them, no gaps
 * or separate cards. Each cell rules its end and bottom; the grid reaches a pixel under the frame's
 * end and bottom, so a full row's outer lines disappear and a short row still ends in a line.
 */
export function ProductGrid(props: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", props.className)}>
      <div className="-me-px -mb-px grid sm:grid-cols-2 lg:grid-cols-3">{props.children}</div>
    </div>
  );
}

/** One product: the whole cell opens it; `action` (a pin button) sits above that link. */
export function ProductCell(props: {
  product: Product;
  href: string;
  /** A figure (`1.2k emails in 14 days`) or a status under the description. */
  detail?: ReactNode;
  action?: ReactNode;
  docs?: boolean;
}) {
  const Icon = PRODUCT_ICONS[props.product.key];
  return (
    <div className="group/cell relative flex min-h-36 flex-col gap-3 border-e border-b p-5 transition-colors hover:bg-accent/40">
      <div className="flex items-start justify-between gap-3">
        <ProductGlyph
          className="size-10 rounded-xl transition-transform duration-200 ease-out group-hover/cell:-rotate-3 group-hover/cell:scale-105 motion-reduce:transition-none"
          icon={Icon}
          tone={props.product.key}
        />
        <div className="relative z-10 flex items-center gap-1">
          {props.docs ? (
            <a
              aria-label={`${props.product.name} documentation`}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href={props.product.docs}
            >
              <ArrowUpRightIcon className="size-4" />
            </a>
          ) : null}
          {props.action}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Link
          className="font-heading font-semibold text-base outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
          href={props.href}
        >
          {props.product.name}
        </Link>
        <p className="text-muted-foreground text-sm">{props.product.description}</p>
      </div>
      {props.detail ? <div className="mt-auto text-sm">{props.detail}</div> : null}
    </div>
  );
}
