/** List prices. A price change is a new dated card: periods before it keep the old prices. */
import { dimensionKey, type MeterKey } from "./meters.ts";
import { SMS_PRICES_2026_11_01 } from "./sms-prices-2026-11-01.generated.ts";
import { SMS_PRICES_2027_01_01 } from "./sms-prices-2027-01-01.generated.ts";

/** Units up to and including `upTo` (cumulative; `null` = no limit) cost `unitNanos` each. */
export type Tier = { upTo: number | null; unitNanos: bigint };

export type Rate = {
  /**
   * `graduated`: each unit is priced by the tier its position falls in (no price cliffs).
   * `volume`: every unit is priced by the tier the window's total falls in.
   */
  mode: "graduated" | "volume";
  tiers: readonly Tier[];
  /**
   * Where tier positions are counted from: the billing period (default) or the contract's term
   * (annual volume deals: the 2nd million of the year is cheaper, whichever month it falls in).
   */
  tierWindow?: "period" | "term";
};

/** A meter's rates: one for every dimension value, overridable per value (`country=US`). */
export type MeterRates = {
  default?: Rate;
  byDimension?: Readonly<Record<string, Rate>>;
};

export type RateCard = {
  effectiveFrom: Date;
  rates: Readonly<Partial<Record<MeterKey, MeterRates>>>;
};

export function flatRate(unitNanos: bigint): Rate {
  return { mode: "graduated", tiers: [{ upTo: null, unitNanos }] };
}

/** One flat rate per value of a single dimension (`{ US: … }` → `country=US`). */
function flatRates(name: string, prices: Readonly<Record<string, bigint>>): Record<string, Rate> {
  return Object.fromEntries(
    Object.entries(prices).map(([value, nanos]) => [
      dimensionKey({ [name]: value }),
      flatRate(nanos),
    ]),
  );
}

const LAUNCH: RateCard = {
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  rates: {
    // $0.40 per 1,000 recipients; $0.30 from the 1,000,001st; $0.22 from the 10,000,001st.
    "email.recipients": {
      default: {
        mode: "graduated",
        tiers: [
          { upTo: 1_000_000, unitNanos: 400_000n },
          { upTo: 10_000_000, unitNanos: 300_000n },
          { upTo: null, unitNanos: 220_000n },
        ],
      },
    },
    // $0.10 per 1,000 recipients sent through dedicated IPs (first priced when the meter was added;
    // it had no usage before).
    "email.dedicated_ip": { default: flatRate(100_000n) },
    // $0.40 per 1,000 received emails, tiered like sending (first priced when the meter was
    // added; it had no usage before).
    "email.received": {
      default: {
        mode: "graduated",
        tiers: [
          { upTo: 1_000_000, unitNanos: 400_000n },
          { upTo: 10_000_000, unitNanos: 300_000n },
          { upTo: null, unitNanos: 220_000n },
        ],
      },
    },
    // An inbox for 30 days: $0.99 up to 100 inboxes held all month (3,100 inbox-days), $0.24 up
    // to 1,000 (31,000), $0.045 beyond (first priced when the meter was added). Per day: $0.033,
    // $0.008, $0.0015.
    "email.inboxes": {
      default: {
        mode: "graduated",
        tiers: [
          { upTo: 3_100, unitNanos: 33_000_000n },
          { upTo: 31_000, unitNanos: 8_000_000n },
          { upTo: null, unitNanos: 1_500_000n },
        ],
      },
    },
    // US only; other countries are priced per contract.
    "sms.segments": { byDimension: { "country=US": flatRate(14_200_000n) } },
    // $0.01 per phone check (first priced when the meter was added; it had no usage before).
    "risk.phone_checks": { default: flatRate(10_000_000n) },
    // Forms: $1 per 1,000 accepted submissions (spam, held and unconfirmed ones are free), and
    // $0.25 per 1,000 MB of their files, kept for the submissions' 90 days (first priced when the
    // meters were added; no organization had used them).
    "forms.submissions": { default: flatRate(1_000_000n) },
    "forms.file_uploads": { default: flatRate(250_000n) },
    // $0.10 per booking.
    "scheduling.bookings": { default: flatRate(100_000_000n) },
  },
};

const NOVEMBER_2026: RateCard = {
  // SMS in every country Twilio prices (a country without a rate can't be sent to), with
  // numbers and US carrier registration fees passed through at cost.
  effectiveFrom: new Date("2026-11-01T00:00:00Z"),
  rates: {
    ...LAUNCH.rates,
    "sms.segments": { byDimension: flatRates("country", SMS_PRICES_2026_11_01.outbound) },
    "sms.received_segments": {
      byDimension: flatRates("country", SMS_PRICES_2026_11_01.inbound),
    },
    // Verify: $0.05 per approved verification; codes from coss.com's shared numbers at the SMS
    // price of their country.
    "verify.verifications": { default: flatRate(50_000_000n) },
    "verify.sms": { byDimension: flatRates("country", SMS_PRICES_2026_11_01.outbound) },
    // $1.15 a month for a local number, $2.15 for a toll-free one.
    "sms.numbers": {
      byDimension: flatRates("type", { local: 1_150_000_000n, toll_free: 2_150_000_000n }),
    },
    // A2P 10DLC: brand $4.50 (+ $41.50 secondary vetting for standard brands), $15 per campaign
    // vetted, then $10 a month per campaign ($1.50 for low-volume mixed campaigns).
    "sms.registrations": {
      byDimension: flatRates("fee", {
        brand: 4_500_000_000n,
        brand_vetting: 41_500_000_000n,
        campaign_vetting: 15_000_000_000n,
        campaign_monthly: 10_000_000_000n,
        campaign_monthly_low_volume: 1_500_000_000n,
      }),
    },
    // $0.10 per 1,000 Hooks messages (first priced when the meter was added; it had no usage before).
    "hooks.messages": { default: flatRate(100_000n) },
  },
};

const JANUARY_2027: RateCard = {
  // Twilio's price changes: SMS to Canada and SMS received in the US. Also the first prices of SMS
  // received on Canadian numbers and of Scheduling hosts (the Terms' 30 days' notice).
  effectiveFrom: new Date("2027-01-01T00:00:00Z"),
  rates: {
    ...NOVEMBER_2026.rates,
    "sms.segments": { byDimension: flatRates("country", SMS_PRICES_2027_01_01.outbound) },
    "sms.received_segments": {
      byDimension: flatRates("country", SMS_PRICES_2027_01_01.inbound),
    },
    "verify.sms": { byDimension: flatRates("country", SMS_PRICES_2027_01_01.outbound) },
    // A host for 30 days: $0.99 beyond what the plan includes. Per day: $0.033.
    "scheduling.hosts": { default: flatRate(33_000_000n) },
  },
};

/** In ascending `effectiveFrom` order. */
export const RATE_CARDS: readonly RateCard[] = [LAUNCH, NOVEMBER_2026, JANUARY_2027];

/** The list prices in effect at `at` (the first card for earlier dates). */
export function rateCardAt(at: Date, cards: readonly RateCard[] = RATE_CARDS): RateCard {
  let current = cards[0];
  if (!current) throw new Error("No rate card is defined.");
  for (const card of cards) if (card.effectiveFrom <= at) current = card;
  return current;
}

/** When list prices first price `meter`: until then its usage must not be recorded as charged. */
export function meterPricedFrom(
  meter: MeterKey,
  cards: readonly RateCard[] = RATE_CARDS,
): Date | null {
  return cards.find((card) => card.rates[meter])?.effectiveFrom ?? null;
}

/** The rate for one dimension value: its own, else the meter's default. */
export function rateFor(rates: MeterRates | undefined, dimension: string): Rate | null {
  return rates?.byDimension?.[dimension] ?? rates?.default ?? null;
}
