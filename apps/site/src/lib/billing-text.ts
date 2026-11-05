import {
  ADD_ON_KEYS,
  ADD_ONS,
  type AddOnDefinition,
  addOnGranting,
  CREDIT_POLICY,
  FEATURE_KEYS,
  FEATURE_LABELS,
  type FeatureKey,
  formatDimension,
  formatSupportTarget,
  LIMIT_KEYS,
  LIMIT_LABELS,
  type LimitKey,
  METER_KEYS,
  METERS,
  type MeterKey,
  meterAmount,
  PLAN_KEYS,
  PLANS,
  type PlanKey,
  type Product,
  RATE_CARDS,
  type Rate,
  SUPPORT_HOURS,
  SUPPORT_TIERS,
} from "@coss/billing/catalog";
import { formatCents, formatUnitPrice } from "@coss/billing/money";
import { emailTierCharges, formatPrice, METER_NOTES } from "./pricing";

/** "3,000 email recipients a month"; inbox-days read as the inboxes they cover. */
function includedText(meter: MeterKey, n: number): string {
  if (meter === "email.inboxes") return `${Math.floor(n / 31).toLocaleString("en-US")} inboxes`;
  if (meter === "scheduling.hosts") {
    return `${Math.floor(n / 31).toLocaleString("en-US")} Scheduling hosts`;
  }
  if (meter === "email.received") return `${n.toLocaleString("en-US")} received emails a month`;
  return `${meterAmount(meter, n)} a month`;
}

/** What support each plan gets, as rows (`<SupportTable />`, and the first two in `planRows`). */
export function supportRows(): { label: string; values: string[] }[] {
  return [
    {
      label: "Support response target",
      values: PLAN_KEYS.map((key) =>
        formatSupportTarget(SUPPORT_TIERS[key].responseMinutes.normal),
      ),
    },
    {
      label: "Urgent issues",
      values: PLAN_KEYS.map((key) => {
        const urgent = SUPPORT_TIERS[key].responseMinutes.urgent;
        return urgent === null ? "Not included" : formatSupportTarget(urgent);
      }),
    },
    {
      label: "Front of the queue",
      values: PLAN_KEYS.map((key) => (SUPPORT_TIERS[key].frontOfQueue ? "Yes" : "No")),
    },
    {
      label: "Channels",
      values: PLAN_KEYS.map((key) => SUPPORT_TIERS[key].channels.join(", ")),
    },
    {
      label: "Contractual SLA with credits",
      values: PLAN_KEYS.map((key) => (key === "enterprise" ? "By contract" : "No")),
    },
    {
      label: "Hours",
      values: PLAN_KEYS.map((key) =>
        key === "enterprise" ? `${SUPPORT_HOURS.label}; 24x7 by contract` : SUPPORT_HOURS.label,
      ),
    },
  ];
}

/** The plans and their features, as rows (shared by the MDX table and the Markdown for /llms*.txt). */
export function planRows(): { label: string; values: string[] }[] {
  const plans = PLAN_KEYS.map((key) => PLANS[key]);
  const included = (key: (typeof PLAN_KEYS)[number]) => {
    const plan = PLANS[key];
    if (key === "enterprise") return "Per contract";
    const units = Object.entries(plan.includedUnits).map(([meter, n]) =>
      includedText(meter as MeterKey, n),
    );
    if (plan.feeCents > 0n) units.unshift(`${formatPrice(plan.feeCents)} of usage`);
    return units.join(", ") || "None";
  };
  return [
    {
      label: "Price",
      values: plans.map((plan) =>
        plan.key === "enterprise"
          ? `From ${formatPrice(plan.feeCents)}/month, annual commitment`
          : plan.feeCents === 0n
            ? "Free"
            : `${formatPrice(plan.feeCents)}/month`,
      ),
    },
    { label: "Included", values: PLAN_KEYS.map(included) },
    ...supportRows().slice(0, 2),
    {
      label: "Usage beyond it",
      values: plans.map((plan) =>
        plan.key === "enterprise"
          ? "Contract rates"
          : plan.overage === "blocked"
            ? "Not available"
            : "Usage rates below",
      ),
    },
    {
      label: "Sending rate",
      values: plans.map((plan) => {
        if (plan.key === "enterprise") return "Custom";
        const { rateLimits } = plan.entitlements;
        const second = rateLimits["email.recipients.second"].limit.toLocaleString("en-US");
        const day = rateLimits["email.recipients.day"].limit.toLocaleString("en-US");
        return `${second} emails a second, ${day} a day`;
      }),
    },
    {
      label: "SMS rate",
      values: plans.map((plan) => {
        if (plan.key === "enterprise") return "Custom";
        const included: Partial<Record<MeterKey, number>> = plan.includedUnits;
        if (plan.overage === "blocked" && !included["sms.segments"]) {
          return "Sandbox only";
        }
        const { rateLimits } = plan.entitlements;
        const second = rateLimits["sms.segments.second"].limit.toLocaleString("en-US");
        const day = rateLimits["sms.segments.day"].limit.toLocaleString("en-US");
        return `${second} SMS segments a second, ${day} a day`;
      }),
    },
    {
      label: "Marketing rate",
      values: plans.map((plan) => {
        if (plan.key === "enterprise") return "Custom";
        const { limit } = plan.entitlements.rateLimits["email.marketing.recipients.second"];
        return `${limit.toLocaleString("en-US")} marketing emails a second`;
      }),
    },
    {
      label: "Scheduling slot rate",
      values: plans.map((plan) => {
        if (plan.key === "enterprise") return "Custom";
        const { limit } = plan.entitlements.rateLimits["scheduling.slots.second"];
        return `${limit.toLocaleString("en-US")} slot lists or searches a second`;
      }),
    },
    ...LIMIT_KEYS.map((key) => ({
      label: LIMIT_LABELS[key],
      values: plans.map((plan) =>
        plan.key === "enterprise" && key !== "members"
          ? "Custom"
          : (plan.entitlements.limits[key]?.toLocaleString("en-US") ?? "Unlimited"),
      ),
    })),
    ...FEATURE_KEYS.map((key) => ({
      label: FEATURE_LABELS[key],
      values: plans.map((plan) =>
        plan.entitlements.features[key]
          ? "Yes"
          : addOnGranting(key)?.plans.includes(plan.key)
            ? "Add-on"
            : "—",
      ),
    })),
    {
      label: "HIPAA mode with a BAA",
      values: plans.map((plan) => (plan.key === "enterprise" ? "By contract" : "—")),
    },
  ];
}

function describeRate(rate: Rate, meter: MeterKey): string {
  const { displayPer: per, unit, units } = METERS[meter];
  const perLabel = per === 1 ? unit : `${per.toLocaleString("en-US")} ${units}`;
  const price = (unitNanos: bigint) => `${formatUnitPrice(unitNanos, per)} per ${perLabel}`;
  const [only] = rate.tiers;
  if (rate.tiers.length === 1 && only) return price(only.unitNanos);
  let from = 0;
  return rate.tiers
    .map((tier) => {
      const span =
        tier.upTo === null
          ? `beyond ${from.toLocaleString("en-US")}`
          : from === 0
            ? `for the first ${tier.upTo.toLocaleString("en-US")}`
            : `from ${(from + 1).toLocaleString("en-US")} to ${tier.upTo.toLocaleString("en-US")}`;
      from = tier.upTo ?? from;
      return `${price(tier.unitNanos)} ${span}`;
    })
    .join("; ");
}

/**
 * The list usage rates per meter (the current rate card), optionally of one product only or of
 * the meters listed.
 */
export function rateRows(
  only?: Product | readonly MeterKey[],
): { product: string; rate: string; note: string }[] {
  const card = RATE_CARDS.at(-1);
  if (!card) return [];
  return METER_KEYS.flatMap((meter) => {
    const definition = METERS[meter];
    if (typeof only === "string" && definition.product !== only) return [];
    if (Array.isArray(only) && !only.includes(meter)) return [];
    const rates = card.rates[meter];
    if (!rates) return [];
    const addOn = meter === "email.dedicated_ip" ? ADD_ONS.dedicated_ips : null;
    const note = addOn
      ? `With the ${addOn.name} add-on, on top of Email`
      : (METER_NOTES[meter] ?? "");
    if (rates.default) {
      return [
        {
          product: definition.label,
          rate: describeRate(rates.default, meter),
          note,
        },
      ];
    }
    const entries = Object.entries(rates.byDimension ?? {});
    const dimensions: readonly string[] = definition.dimensions;
    if (dimensions.includes("country")) {
      // Every country is listed on the pricing page; here the US and the range of the others.
      const us = rates.byDimension?.["country=US"];
      const others = entries
        .filter(([dimension]) => dimension !== "country=US")
        .flatMap(([, rate]) => rate.tiers.map((tier) => tier.unitNanos));
      const rows = us
        ? [
            {
              product: `${definition.label} (US)`,
              rate: describeRate(us, meter),
              note: "",
            },
          ]
        : [];
      if (others.length) {
        const low = others.reduce((a, b) => (a < b ? a : b));
        const high = others.reduce((a, b) => (a > b ? a : b));
        rows.push({
          product: `${definition.label} (other countries)`,
          rate: `${formatUnitPrice(low)} to ${formatUnitPrice(high)} per ${definition.unit}`,
          note: "By country: coss.com/pricing#sms",
        });
      }
      return rows;
    }
    const fee = definition.unit === "fee";
    return entries.map(([dimension, rate]) => ({
      product: `${definition.label} (${formatDimension(dimension)})`,
      rate: fee ? formatUnitPrice(rate.tiers[0]?.unitNanos ?? 0n) : describeRate(rate, meter),
      note: fee ? "Passed through at cost" : "",
    }));
  });
}

/** The add-ons sold on top of a plan. */
export function addOnRows(): { name: string; price: string; plans: string; description: string }[] {
  return ADD_ON_KEYS.map((key) => {
    const addOn: AddOnDefinition = ADD_ONS[key];
    return {
      name: addOn.name,
      price: `${formatPrice(addOn.unitAmountCents)}/${addOn.interval}`,
      plans: addOn.plans.map((plan) => PLANS[plan].name).join(", "),
      description: addOn.description,
    };
  });
}

/** The billing MDX components (`src/components/billing.tsx`) as Markdown, for /llms*.txt. */
export function renderBillingComponents(markdown: string): string {
  const plans = PLAN_KEYS.map((key) => PLANS[key].name);
  const planTable = [
    `| | ${plans.join(" | ")} |`,
    `| --- | ${plans.map(() => "---").join(" | ")} |`,
    ...planRows().map((row) => `| ${row.label} | ${row.values.join(" | ")} |`),
  ].join("\n");
  const rateTable = (only?: Product | readonly MeterKey[]) =>
    [
      "| Product | Rate | |",
      "| --- | --- | --- |",
      ...rateRows(only).map(
        (row) => `| ${row.product} | ${row.rate} |${row.note ? ` ${row.note} ` : " "}|`,
      ),
    ].join("\n");
  const addOnTable = [
    "| Add-on | Price | Plans | |",
    "| --- | --- | --- | --- |",
    ...addOnRows().map(
      (row) => `| ${row.name} | ${row.price} | ${row.plans} | ${row.description} |`,
    ),
  ].join("\n");
  const supportTable = [
    `| | ${PLAN_KEYS.map((key) => PLANS[key].name).join(" | ")} |`,
    `| --- | ${PLAN_KEYS.map(() => "---").join(" | ")} |`,
    ...supportRows().map((row) => `| ${row.label} | ${row.values.join(" | ")} |`),
  ].join("\n");
  return renderInlineBillingComponents(markdown)
    .replaceAll("<PlanTable />", planTable)
    .replaceAll("<UsageRates />", rateTable())
    .replace(/<UsageRates product="([a-z]+)" \/>/g, (_, product: Product) => rateTable(product))
    .replace(/<UsageRates meters="([a-z_.,]+)" \/>/g, (_, meters: string) =>
      rateTable(meters.split(",") as MeterKey[]),
    )
    .replaceAll("<AddOns />", addOnTable)
    .replaceAll("<SupportTable />", supportTable);
}

/*
 * Inline facts for prose (the product, solution and comparison pages, and their MDX components
 * in src/components/billing.tsx): a price or a limit is always read from the catalog, never typed.
 */

const CREDIT_AMOUNTS = {
  "new-limit": CREDIT_POLICY.newAccountLimitCents,
  "max-limit": CREDIT_POLICY.maxAutomaticLimitCents,
  "min-threshold": CREDIT_POLICY.minThresholdCents,
  "max-threshold": CREDIT_POLICY.maxThresholdCents,
} as const;
export type CreditAmountKey = keyof typeof CREDIT_AMOUNTS;

/** "$500": an amount of the credit policy. */
export function creditAmountText(of: CreditAmountKey): string {
  return formatCents(CREDIT_AMOUNTS[of]).replace(/\.00$/, "");
}

/** "Scale and Enterprise", or "Pro, Scale and Enterprise": the plans with a feature (or its add-on). */
export function plansWithText(feature: FeatureKey): string {
  const names = PLAN_KEYS.filter(
    (key) =>
      PLANS[key].entitlements.features[feature] || addOnGranting(feature)?.plans.includes(key),
  ).map((key) => PLANS[key].name);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : (names[0] ?? "");
}

/** A meter's current list rate in one line ("$0.40 per 1,000 emails for the first 1,000,000; …"). */
export function rateText(meter: MeterKey): string {
  return rateRows([meter])
    .map((row) => (rateRows([meter]).length > 1 ? `${row.product}: ${row.rate}` : row.rate))
    .join("; ");
}

/** What a plan includes of a meter every month ("3,000 email recipients a month"), or "". */
export function includedUnitsText(meter: MeterKey, plan: PlanKey = "free"): string {
  const n: number | undefined = (PLANS[plan].includedUnits as Partial<Record<MeterKey, number>>)[
    meter
  ];
  return n ? includedText(meter, n) : "";
}

/** A plan's limit ("1,000", "Unlimited"). */
export function limitText(limit: LimitKey, plan: PlanKey): string {
  return PLANS[plan].entitlements.limits[limit]?.toLocaleString("en-US") ?? "Unlimited";
}

/** A plan's monthly fee ("$25/month", "Free"). */
export function planPriceText(plan: PlanKey): string {
  const { feeCents } = PLANS[plan];
  return feeCents === 0n ? "Free" : `${formatPrice(feeCents)}/month`;
}

/*
 * The billing guide's worked example (`<GraduatedExample />`, `<BillingExample />`): a month of
 * email on Pro, priced by the rating engine's tier math at the current list rates.
 */

const EXAMPLE_EMAILS = 2_000_000;
const EXAMPLE_PLAN: PlanKey = "pro";

function exampleUsageCents(): bigint {
  return emailTierCharges(EXAMPLE_EMAILS).reduce((sum, tier) => sum + tier.amountCents, 0n);
}

/** "With 2,000,000 emails in a month, the first 1,000,000 cost $0.40 per 1,000 and …: $700." */
export function graduatedExampleText(): string {
  const per = METERS["email.recipients"].displayPer.toLocaleString("en-US");
  const bands = emailTierCharges(EXAMPLE_EMAILS).map((tier, index) => {
    const count = (tier.last - tier.first + 1).toLocaleString("en-US");
    return index === 0
      ? `the first ${count} cost ${tier.pricePerThousand} per ${per}`
      : `the next ${count} ${tier.pricePerThousand} per ${per}`;
  });
  const list =
    bands.length > 1 ? `${bands.slice(0, -1).join(", ")} and ${bands.at(-1)}` : (bands[0] ?? "");
  return `With ${EXAMPLE_EMAILS.toLocaleString("en-US")} emails in a month, ${list}: ${formatPrice(exampleUsageCents())}.`;
}

/** The example month on Pro: what is charged when, and what the month cost in the end. */
export function billingExample(): {
  intro: string;
  rows: { label: string; amount: string; total?: boolean }[];
  summary: string;
} {
  const plan = PLANS[EXAMPLE_PLAN];
  const fee = plan.feeCents;
  const usage = exampleUsageCents();
  const credit = usage < fee ? usage : fee;
  return {
    intro: `For example, on ${plan.name} with ${EXAMPLE_EMAILS.toLocaleString("en-US")} emails in October:`,
    rows: [
      { label: "October fee (charged October 1)", amount: formatCents(fee) },
      { label: "October usage", amount: formatCents(usage) },
      { label: "October credit", amount: formatCents(-credit) },
      {
        label: `Charged November 1 (with November's ${formatPrice(fee)} fee)`,
        amount: formatCents(usage - credit),
        total: true,
      },
    ],
    summary: `Over the month you paid ${formatPrice(usage > fee ? usage : fee)}: the larger of the fee and the usage.`,
  };
}

function billingExampleMarkdown(): string {
  const { intro, rows, summary } = billingExample();
  const table = rows.map(({ label, amount, total }) =>
    total ? `| **${label}** | **${amount}** |` : `| ${label} | ${amount} |`,
  );
  return [intro, "", "| | |", "| --- | --- |", ...table, "", summary].join("\n");
}

/** The inline billing components (`<Rate meter>`, `<PlansWith feature>`, …) as Markdown text. */
export function renderInlineBillingComponents(markdown: string): string {
  return markdown
    .replace(/<Rate meter="([a-z_.]+)" \/>/g, (_, meter: MeterKey) => rateText(meter))
    .replace(/<PlansWith feature="([a-zA-Z]+)" \/>/g, (_, feature: FeatureKey) =>
      plansWithText(feature),
    )
    .replace(/<Included meter="([a-z_.]+)"(?: plan="([a-z]+)")? \/>/g, (_, meter, plan) =>
      includedUnitsText(meter as MeterKey, (plan as PlanKey | undefined) ?? "free"),
    )
    .replace(/<Limit of="([a-zA-Z]+)" plan="([a-z]+)" \/>/g, (_, limit, plan) =>
      limitText(limit as LimitKey, plan as PlanKey),
    )
    .replace(/<PlanPrice plan="([a-z]+)" \/>/g, (_, plan) => planPriceText(plan as PlanKey))
    .replace(/<CreditAmount of="([a-z-]+)" \/>/g, (_, of) =>
      creditAmountText(of as CreditAmountKey),
    )
    .replaceAll("<GraduatedExample />", graduatedExampleText())
    .replaceAll("<BillingExample />", billingExampleMarkdown());
}
