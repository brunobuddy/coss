import { PLAN_KEYS, PLANS } from "@coss/billing/catalog";
import { planRows } from "@/lib/billing-text";
import { ComparisonRows } from "./comparison-rows";

/** Every plan's limits and features (the same rows as the billing guide's table). */
export function PlanComparison() {
  return (
    <ComparisonRows
      plans={PLAN_KEYS.map((key) => ({ key, name: PLANS[key].name }))}
      rows={planRows()}
    />
  );
}
