import {
  type FeatureKey,
  type LimitKey,
  type MeterKey,
  PLAN_KEYS,
  PLANS,
  type PlanKey,
  type Product,
} from "@coss/billing/catalog";
import {
  addOnRows,
  billingExample,
  type CreditAmountKey,
  creditAmountText,
  graduatedExampleText,
  includedUnitsText,
  limitText,
  planPriceText,
  planRows,
  plansWithText,
  rateRows,
  rateText,
  supportRows,
} from "@/lib/billing-text";
import { DocsTable, DocsTd, DocsTh, DocsTr } from "./docs-table";

/** The plans side by side (from `@coss/billing/catalog`, which billing enforces). */
export function PlanTable() {
  return (
    <DocsTable>
      <thead>
        <DocsTr>
          <DocsTh />
          {PLAN_KEYS.map((key) => (
            <DocsTh key={key}>{PLANS[key].name}</DocsTh>
          ))}
        </DocsTr>
      </thead>
      <tbody>
        {planRows().map((row) => (
          <DocsTr key={row.label}>
            <DocsTd>{row.label}</DocsTd>
            {row.values.map((value, index) => (
              <DocsTd key={PLAN_KEYS[index]}>{value}</DocsTd>
            ))}
          </DocsTr>
        ))}
      </tbody>
    </DocsTable>
  );
}

/** What support each plan gets (from `SUPPORT_TIERS`, which the desk's clock runs on). */
export function SupportTable() {
  return (
    <DocsTable>
      <thead>
        <DocsTr>
          <DocsTh />
          {PLAN_KEYS.map((key) => (
            <DocsTh key={key}>{PLANS[key].name}</DocsTh>
          ))}
        </DocsTr>
      </thead>
      <tbody>
        {supportRows().map((row) => (
          <DocsTr key={row.label}>
            <DocsTd>{row.label}</DocsTd>
            {row.values.map((value, index) => (
              <DocsTd key={PLAN_KEYS[index]}>{value}</DocsTd>
            ))}
          </DocsTr>
        ))}
      </tbody>
    </DocsTable>
  );
}

/** The list usage rates per product (or of one `product`'s meters, or of `meters`: comma-separated). */
export function UsageRates({ product, meters }: { product?: Product; meters?: string }) {
  return (
    <DocsTable>
      <thead>
        <DocsTr>
          <DocsTh>Product</DocsTh>
          <DocsTh>Rate</DocsTh>
          <DocsTh />
        </DocsTr>
      </thead>
      <tbody>
        {rateRows(meters ? (meters.split(",") as MeterKey[]) : product).map((row) => (
          <DocsTr key={row.product}>
            <DocsTd>{row.product}</DocsTd>
            <DocsTd>{row.rate}</DocsTd>
            <DocsTd>{row.note}</DocsTd>
          </DocsTr>
        ))}
      </tbody>
    </DocsTable>
  );
}

/** The add-ons sold on top of a plan. */
export function AddOns() {
  return (
    <DocsTable>
      <thead>
        <DocsTr>
          <DocsTh>Add-on</DocsTh>
          <DocsTh>Price</DocsTh>
          <DocsTh>Plans</DocsTh>
          <DocsTh />
        </DocsTr>
      </thead>
      <tbody>
        {addOnRows().map((row) => (
          <DocsTr key={row.name}>
            <DocsTd>{row.name}</DocsTd>
            <DocsTd>{row.price}</DocsTd>
            <DocsTd>{row.plans}</DocsTd>
            <DocsTd>{row.description}</DocsTd>
          </DocsTr>
        ))}
      </tbody>
    </DocsTable>
  );
}

/*
 * Inline facts for prose, read from the catalog (`renderInlineBillingComponents` writes the same
 * text into Markdown): `<Rate meter="email.inboxes" />`, `<PlansWith feature="sso" />`,
 * `<Included meter="email.recipients" />`, `<Limit of="inboxes" plan="pro" />`,
 * `<PlanPrice plan="pro" />`.
 */

export function Rate({ meter }: { meter: MeterKey }) {
  return <>{rateText(meter)}</>;
}

export function PlansWith({ feature }: { feature: FeatureKey }) {
  return <>{plansWithText(feature)}</>;
}

export function Included({ meter, plan = "free" }: { meter: MeterKey; plan?: PlanKey }) {
  return <>{includedUnitsText(meter, plan)}</>;
}

export function Limit({ of, plan }: { of: LimitKey; plan: PlanKey }) {
  return <>{limitText(of, plan)}</>;
}

export function CreditAmount({ of }: { of: CreditAmountKey }) {
  return <>{creditAmountText(of)}</>;
}

export function PlanPrice({ plan }: { plan: PlanKey }) {
  return <>{planPriceText(plan)}</>;
}

/** The billing guide's worked example of graduated pricing, in one sentence. */
export function GraduatedExample() {
  return <>{graduatedExampleText()}</>;
}

/** The billing guide's worked example of a month on Pro: fee, usage, credit and the next charge. */
export function BillingExample() {
  const { intro, rows, summary } = billingExample();
  return (
    <>
      <p>{intro}</p>
      <DocsTable>
        <tbody>
          {rows.map(({ label, amount, total }) => (
            <DocsTr key={label}>
              <DocsTd>{total ? <strong>{label}</strong> : label}</DocsTd>
              <DocsTd>{total ? <strong>{amount}</strong> : amount}</DocsTd>
            </DocsTr>
          ))}
        </tbody>
      </DocsTable>
      <p>{summary}</p>
    </>
  );
}
