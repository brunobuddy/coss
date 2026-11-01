"use client";

import { isProductKey } from "@coss/dashboard-routes";
import { cn } from "@coss/ui/lib/utils";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TILE } from "./product-glyph";

/**
 * An icon tile in the colour of the product the page belongs to (neutral elsewhere): empty states
 * inside Email are orange, inside Risk rose.
 */
export function ToneTile(props: { className?: string; children: ReactNode }) {
  const pathname = usePathname();
  const params = useParams<{ orgSlug?: string; projectSlug?: string; envSlug?: string }>();
  const base =
    params.orgSlug && params.projectSlug && params.envSlug
      ? `/${params.orgSlug}/${params.projectSlug}/${params.envSlug}`
      : null;
  const product = base ? (pathname.slice(base.length).split("/")[1] ?? "") : "";
  const tone = isProductKey(product) ? product : "neutral";
  return (
    <span
      className={cn(
        "flex items-center justify-center ring-1 ring-inset inset-shadow-[0_1px_--theme(--color-white/65%)] dark:inset-shadow-[0_1px_--theme(--color-white/10%)]",
        TILE[tone],
        props.className,
      )}
    >
      {props.children}
    </span>
  );
}
