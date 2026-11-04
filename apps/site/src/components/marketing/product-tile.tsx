import { cn } from "@coss/ui/lib/utils";
import { productVisual, TILE_TONES } from "@/lib/product-visuals";

/** A product's icon tile, the same as in the dashboard's rail. */
export function ProductTile({
  slug,
  size = "md",
  className,
}: {
  slug: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { icon: Icon, tone } = productVisual(slug);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center ring-1 ring-inset",
        TILE_TONES[tone],
        size === "sm" && "size-7 rounded-md [&_svg]:size-3.5",
        size === "md" && "size-9 rounded-lg [&_svg]:size-4.5",
        size === "lg" && "size-12 rounded-xl [&_svg]:size-6",
        className,
      )}
    >
      <Icon />
    </span>
  );
}
