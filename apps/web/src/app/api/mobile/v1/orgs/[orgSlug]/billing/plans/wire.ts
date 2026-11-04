import {
  ADD_ON_KEYS,
  ADD_ONS,
  type AddOnDefinition,
  addOnGranting,
  FEATURE_KEYS,
  FEATURE_LABELS,
  formatCents,
  LIMIT_KEYS,
  LIMIT_LABELS,
  METER_KEYS,
  METERS,
  PLAN_KEYS,
  PLANS,
  rateCardAt,
} from "@coss/billing";
import type { PlanCell, PlansResponse } from "@coss/companion";
import { formatMeterRates } from "@/lib/billing-format";

// Built like the dashboard's plans page (apps/web/src/app/[orgSlug]/settings/billing/plans/page.tsx).

type PlanKey = (typeof PLAN_KEYS)[number];

function price(plan: (typeof PLANS)[PlanKey]): string {
  if (plan.feeCents === 0n) return "$0";
  return `${plan.selfServe ? "" : "From "}${formatCents(plan.feeCents).replace(/\.00$/, "")}/month`;
}

export function toMobilePlans(current: PlanKey): PlansResponse["plans"] {
  return PLAN_KEYS.map((key) => {
    const plan = PLANS[key];
    return {
      key,
      name: plan.name,
      description: plan.description,
      price: price(plan),
      highlights: [...plan.highlights],
      current: key === current,
    };
  });
}

/** "What each plan includes": limits, features (or "Add-on"), recipients per second. */
export function toMobilePlanIncludes(): PlansResponse["includes"] {
  const limits = LIMIT_KEYS.map((limit) => ({
    label: LIMIT_LABELS[limit],
    cells: PLAN_KEYS.map((key): PlanCell => {
      const value = PLANS[key].entitlements.limits[limit];
      return value === null ? "Unlimited" : value.toLocaleString("en-US");
    }),
  }));
  const features = FEATURE_KEYS.map((feature) => ({
    label: FEATURE_LABELS[feature],
    cells: PLAN_KEYS.map(
      (key): PlanCell =>
        PLANS[key].entitlements.features[feature]
          ? true
          : addOnGranting(feature)?.plans.includes(key)
            ? "Add-on"
            : false,
    ),
  }));
  const recipients = {
    label: "Recipients per second",
    cells: PLAN_KEYS.map(
      (key): PlanCell =>
        `${PLANS[key].entitlements.rateLimits["email.recipients.second"].limit}${PLANS[key].selfServe ? "" : "+"}`,
    ),
  };
  return [...limits, ...features, recipients];
}

export function toMobileAddOns(): PlansResponse["add_ons"] {
  return ADD_ON_KEYS.map((key) => {
    const addOn: AddOnDefinition = ADD_ONS[key];
    return {
      name: addOn.name,
      description: `${formatCents(addOn.unitAmountCents)} per ${addOn.interval}, on the ${addOn.plans.map((plan) => PLANS[plan].name).join(" and ")} plans. ${addOn.description}`,
    };
  });
}

export function toMobileUsagePrices(now: Date): PlansResponse["usage_prices"] {
  const rates = rateCardAt(now).rates;
  return METER_KEYS.filter((meter) => rates[meter]).map((meter) => ({
    label: METERS[meter].label,
    rates: formatMeterRates(meter, rates[meter]),
  }));
}
