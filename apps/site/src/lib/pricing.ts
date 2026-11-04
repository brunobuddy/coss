/**
 * What the pricing page computes from the catalog: email bill estimates (with the rating engine's
 * own tier math, so the page and the invoices agree) and the usage rate tables. Client-safe.
 */
import {
  ADD_ONS,
  formatDimension,
  METER_KEYS,
  METERS,
  type MeterKey,
  PLANS,
  type PlanKey,
  planDefinition,
  RATE_CARDS,
  type Rate,
} from "@coss/billing/catalog";
import { chargeRange } from "@coss/billing/engine";
import { formatUnitPrice, nanosToCents } from "@coss/billing/money";
import { RETENTION_DAYS } from "@coss/retention";

const EMAIL: MeterKey = "email.recipients";

/** Priced in the catalog, but the product hasn't shipped: public rate tables leave them out. */
export const UNRELEASED_METERS: ReadonlySet<MeterKey> = new Set(["video.participant_minutes"]);

/** The plans the estimator compares (Enterprise is priced per contract). */
export const ESTIMATED_PLANS = ["free", "pro", "scale"] as const satisfies readonly PlanKey[];
export type EstimatedPlan = (typeof ESTIMATED_PLANS)[number];

/** Days in an average month, to turn a monthly volume into a daily pace. */
const DAYS_PER_MONTH = 30;

/** "$25", "$2,000", "$0.40": whole dollars without cents. */
export function formatPrice(cents: bigint): string {
  const negative = cents < 0n;
  const magnitude = negative ? -cents : cents;
  const dollars = (magnitude / 100n).toLocaleString("en-US");
  const rest = magnitude % 100n;
  return `${negative ? "-" : ""}$${dollars}${rest === 0n ? "" : `.${rest.toString().padStart(2, "0")}`}`;
}

/** Sign-up from a plan's card: a paid plan's choice ends on the dashboard's plans page. */
export function planSignUpPath(plan: PlanKey): string {
  if (plan === "free" || plan === "enterprise") return "/sign-up";
  return `/sign-up?next=${encodeURIComponent(`/dashboard?plan=${plan}`)}`;
}

function currentEmailRate(): Rate {
  const rate = RATE_CARDS.at(-1)?.rates[EMAIL]?.default;
  if (!rate) throw new Error("The rate card has no email rate.");
  return rate;
}

export type EmailTierCharge = {
  /** The first and last email this band covers (1-based). */
  first: number;
  last: number;
  /** Dollars per 1,000, e.g. "$0.40". */
  pricePerThousand: string;
  amountCents: bigint;
};

/** How a month's emails are priced band by band (graduated: each band at its own rate). */
export function emailTierCharges(emails: number): EmailTierCharge[] {
  const charge = chargeRange(currentEmailRate(), 0, emails, emails);
  return charge.tiers.map((tier) => ({
    first: tier.from + 1,
    last: tier.to,
    pricePerThousand: formatUnitPrice(tier.unitNanos, METERS[EMAIL].displayPer),
    amountCents: nanosToCents(tier.amountNanos),
  }));
}

export type MonthEstimate = {
  plan: EstimatedPlan;
  /** The emails at list rates (an invoice rounds each line to the cent once, as here). */
  usageCents: bigint;
  /**
   * What the month costs: the larger of the plan's fee and the usage, since the fee is credit
   * for usage. `null` when the plan can't send that many in a month (Free stops at its allowance).
   */
  totalCents: bigint | null;
  /** The plan's daily sending limit, when sending the month evenly would exceed it. */
  dailyLimit: number | null;
};

/** What `emails` recipients in a month would cost on a self-serve plan, at list prices. */
export function estimateEmailMonth(plan: EstimatedPlan, emails: number): MonthEstimate {
  const definition = planDefinition(plan);
  const usageCents = nanosToCents(chargeRange(currentEmailRate(), 0, emails, emails).amountNanos);
  const included = definition.includedUnits[EMAIL] ?? 0;
  const blocked = definition.overage === "blocked";
  const totalCents = blocked
    ? emails <= included
      ? 0n
      : null
    : usageCents > definition.feeCents
      ? usageCents
      : definition.feeCents;
  const perDay = definition.entitlements.rateLimits["email.recipients.day"].limit;
  return {
    plan,
    usageCents: blocked ? 0n : usageCents,
    totalCents,
    dailyLimit: emails / DAYS_PER_MONTH > perDay ? perDay : null,
  };
}

/**
 * The plan to suggest: the cheapest one that can send the volume within its daily limit (the
 * lower plan on a tie), else Enterprise.
 */
export function suggestedPlan(estimates: readonly MonthEstimate[]): PlanKey {
  let best: MonthEstimate | undefined;
  for (const estimate of estimates) {
    if (estimate.totalCents === null || estimate.dailyLimit !== null) continue;
    if (!best || best.totalCents === null || estimate.totalCents < best.totalCents) best = estimate;
  }
  return best?.plan ?? "enterprise";
}

export type RateTable = {
  meter: MeterKey;
  product: string;
  /** e.g. "per 1,000 recipients". */
  per: string;
  /** e.g. "United States" for a dimension's own rate. */
  scope: string | null;
  /**
   * How the bands read: one `flat` price, `graduated` volume bands (each at its own rate), or a
   * price per `value` (number types, registration fees).
   */
  kind: "flat" | "graduated" | "value";
  bands: { range: string; price: string }[];
  note: string | null;
};

const REGIONS = new Intl.DisplayNames(["en"], { type: "region" });

/** "GB" → "United Kingdom". */
export function countryName(code: string): string {
  try {
    return REGIONS.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Meters priced per country: one card for the United States, every country in `smsRates()`. */
function byCountry(meter: MeterKey): boolean {
  const dimensions: readonly string[] = METERS[meter].dimensions;
  return dimensions.includes("country");
}

function bandsOf(rate: Rate, per: number): RateTable["bands"] {
  const [only] = rate.tiers;
  if (rate.tiers.length === 1 && only) {
    return [{ range: "All usage", price: formatUnitPrice(only.unitNanos, per) }];
  }
  let from = 0;
  return rate.tiers.map((tier) => {
    const range =
      tier.upTo === null
        ? `Above ${from.toLocaleString("en-US")}`
        : from === 0
          ? `First ${tier.upTo.toLocaleString("en-US")}`
          : `${(from + 1).toLocaleString("en-US")} to ${tier.upTo.toLocaleString("en-US")}`;
    from = tier.upTo ?? from;
    return { range, price: formatUnitPrice(tier.unitNanos, per) };
  });
}

/** What a meter's rate card doesn't say on its own. */
export const METER_NOTES: Partial<Record<MeterKey, string>> = {
  "email.received": "Mail flagged as spam or carrying a virus is free",
  "email.inboxes":
    "30 inbox-days are an inbox for a month, charged by the day; every plan includes 3 inboxes",
  "hooks.messages":
    "One per message whatever its fan-out; retries, recoveries and test sends are free",
  "forms.file_uploads": `The files of accepted submissions, kept ${RETENTION_DAYS.formSubmissions} days; rounded up to the MB per submission`,
};

/** The current list rates, one table per meter (and per dimension with its own rate). */
export function rateTables(): RateTable[] {
  const card = RATE_CARDS.at(-1);
  if (!card) return [];
  return METER_KEYS.flatMap((meter): RateTable[] => {
    if (UNRELEASED_METERS.has(meter)) return [];
    const definition = METERS[meter];
    const rates = card.rates[meter];
    if (!rates) return [];
    const passedThrough = definition.unit === "fee";
    const per = passedThrough
      ? "passed through at cost"
      : definition.displayPer === 1
        ? `per ${definition.unit}`
        : `per ${definition.displayPer.toLocaleString("en-US")} ${definition.units}`;
    const note =
      meter === "email.dedicated_ip"
        ? `With the ${ADD_ONS.dedicated_ips.name} add-on (${formatPrice(ADD_ONS.dedicated_ips.unitAmountCents)}/month, on ${ADD_ONS.dedicated_ips.plans.map((plan) => PLANS[plan].name).join(" and ")}), on top of email`
        : byCountry(meter)
          ? "Other countries in the SMS rates below"
          : (METER_NOTES[meter] ?? null);
    const base = {
      meter,
      product: definition.label,
      per,
      note,
    };
    if (rates.default) {
      return [
        {
          ...base,
          scope: null,
          kind: rates.default.tiers.length > 1 ? "graduated" : "flat",
          bands: bandsOf(rates.default, definition.displayPer),
        },
      ];
    }
    const entries = Object.entries(rates.byDimension ?? {});
    if (byCountry(meter)) {
      const us = rates.byDimension?.["country=US"];
      return us
        ? [
            {
              ...base,
              scope: countryName("US"),
              kind: "flat",
              bands: bandsOf(us, definition.displayPer),
            },
          ]
        : [];
    }
    // Flat prices per value (number types, registration fees): one card, a line per value.
    return [
      {
        ...base,
        scope: null,
        kind: "value",
        bands: entries.flatMap(([dimension, rate]) => {
          const [only] = rate.tiers;
          if (!only) return [];
          const label = formatDimension(dimension);
          return [
            {
              range: label.charAt(0).toUpperCase() + label.slice(1),
              price: formatUnitPrice(only.unitNanos, definition.displayPer),
            },
          ];
        }),
      },
    ];
  });
}

export type SmsRate = {
  code: string;
  country: string;
  /** Per segment sent to the country. */
  outbound: string;
  /** Per segment received on a number of the country (`null`: no numbers there). */
  inbound: string | null;
};

/** Every country SMS can be sent to, by name, with its list prices per segment. */
export function smsRates(): SmsRate[] {
  const card = RATE_CARDS.at(-1);
  const outbound = card?.rates["sms.segments"]?.byDimension ?? {};
  const inbound = card?.rates["sms.received_segments"]?.byDimension ?? {};
  const price = (rate: Rate | undefined) => {
    const [only] = rate?.tiers ?? [];
    return only ? formatUnitPrice(only.unitNanos) : null;
  };
  return Object.entries(outbound)
    .flatMap(([dimension, rate]) => {
      const code = dimension.slice(dimension.indexOf("=") + 1);
      const sent = price(rate);
      return sent
        ? [{ code, country: countryName(code), outbound: sent, inbound: price(inbound[dimension]) }]
        : [];
    })
    .sort((a, b) => a.country.localeCompare(b.country));
}
