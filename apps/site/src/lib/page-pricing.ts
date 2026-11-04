import { METERS, type MeterKey, type Product } from "@coss/billing/catalog";
import { includedUnitsText } from "./billing-text";
import { type RateTable, rateTables } from "./pricing";

export type PagePricing = {
  /** How the product is billed, in a sentence or two. */
  lede: string | null;
  tables: RateTable[];
  /** What the Free plan includes of those meters ("3,000 email recipients a month"). */
  included: string[];
};

/**
 * What a page's "Pricing" section prices. Its MDX stays the one source (the `.md` twin renders the
 * same section in full): the page takes the lede and the meters it names, and draws them itself.
 */
export function pagePricing(markdown: string): PagePricing | null {
  const section = markdown.match(
    /<Section title="Pricing"(?: lede="([^"]*)")?>([\s\S]*?)<\/Section>/,
  );
  if (!section) return null;
  const body = section[2] ?? "";
  const named = body.match(/<UsageRates meters="([^"]+)"/)?.[1]?.split(",") ?? [];
  const product = body.match(/<UsageRates product="([^"]+)"/)?.[1] as Product | undefined;
  const all = rateTables();
  const tables = product
    ? all.filter((table) => METERS[table.meter].product === product)
    : named.flatMap((meter) => all.filter((table) => table.meter === meter));
  // Only Free's: the same tag with a `plan` names what a paid plan includes.
  const included = [...body.matchAll(/<Included meter="([^"]+)" \/>/g)]
    .map((match) => includedUnitsText(match[1] as MeterKey))
    .filter(Boolean);
  return { lede: section[1] ?? null, tables, included };
}
