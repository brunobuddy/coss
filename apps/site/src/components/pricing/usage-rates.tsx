import { RateCellCards } from "@/components/pricing/price-panel";
import { rateTables } from "@/lib/pricing";

/** The list usage rates, one card per product (from the current rate card), packed in columns. */
export function UsageRateCards() {
  return <RateCellCards tables={rateTables()} />;
}
