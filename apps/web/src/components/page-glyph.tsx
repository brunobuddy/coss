"use client";

import { DEVELOPERS, sectionOf } from "@coss/dashboard-routes";
import { useParams, usePathname } from "next/navigation";
import { DEVELOPERS_ICON, ORGANIZATION_ICON, PRODUCT_ICONS } from "@/lib/navigation";
import { ProductGlyph } from "./product-glyph";

/** The tile of the product (or Developers, or the organization) a page belongs to, by its title. */
export function PageGlyph() {
  const pathname = usePathname();
  const params = useParams<{ orgSlug?: string; projectSlug?: string; envSlug?: string }>();
  if (!params.orgSlug) return null;
  const glyph = "size-9 rounded-xl";
  if (pathname.startsWith(`/${params.orgSlug}/settings`)) {
    return <ProductGlyph className={glyph} icon={ORGANIZATION_ICON} tone="neutral" />;
  }
  if (!params.projectSlug || !params.envSlug) return null;
  const base = `/${params.orgSlug}/${params.projectSlug}/${params.envSlug}`;
  const section = sectionOf(pathname.slice(base.length));
  if (!section) return null;
  if (section === DEVELOPERS) {
    return <ProductGlyph className={glyph} icon={DEVELOPERS_ICON} tone="neutral" />;
  }
  if (!("key" in section)) return null;
  return <ProductGlyph className={glyph} icon={PRODUCT_ICONS[section.key]} tone={section.key} />;
}
