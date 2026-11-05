import {
  ADD_ON_KEYS,
  ADD_ONS,
  type AddOnDefinition,
  addOnGranting,
  billingStateAt,
  FEATURE_KEYS,
  FEATURE_LABELS,
  formatCents,
  LIMIT_KEYS,
  LIMIT_LABELS,
  METER_KEYS,
  METERS,
  nextPeriod,
  PLAN_KEYS,
  PLANS,
  periodOf,
  rateCardAt,
  scheduledManagedContract,
} from "@coss/billing";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@coss/ui/components/table";
import { cn } from "@coss/ui/lib/utils";
import { CheckIcon, MinusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { SettingsPage, SettingsRow, SettingsSection, SettingsTable } from "@/components/settings";
import { StatusDot } from "@/components/status-dot";
import { formatDate, formatMeterRates } from "@/lib/billing-format";
import { requireOrgMember } from "@/lib/session";
import { DowngradeButton, UpgradeButton } from "../billing-forms";

export const metadata: Metadata = { title: "Plans" };

const SALES_EMAIL = "sales@coss.com";

function price(plan: (typeof PLANS)[keyof typeof PLANS]): string {
  if (plan.feeCents === 0n) return "$0";
  return `${plan.selfServe ? "" : "From "}${formatCents(plan.feeCents).replace(/\.00$/, "")}/month`;
}

export default async function PlansPage({
  params,
}: PageProps<"/[orgSlug]/settings/billing/plans">) {
  const { orgSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ billing: ["read"] })) notFound();
  const canManage = can({ billing: ["update"] });
  const now = new Date();
  const [state, managedNext] = await Promise.all([
    billingStateAt(organization.id, now),
    scheduledManagedContract(organization.id, now),
  ]);
  const current = PLANS[state.terms.plan];
  // Self-serve changes are refused under a sales contract and while one is scheduled.
  const selfServe = (!state.contract || state.contract.kind === "self_serve") && !managedNext;
  const changesOn = nextPeriod(periodOf(now)).start;
  const rates = rateCardAt(now).rates;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        className="max-w-4xl"
        actions={
          <Button
            render={<Link href={`/${organization.slug}/settings/billing`} />}
            size="sm"
            variant="outline"
          >
            Back to billing
          </Button>
        }
        description="Every plan's monthly fee is credit you can spend on any product's usage."
        title="Plans"
      />

      <SettingsPage>
        {selfServe ? null : (
          <p className="text-muted-foreground text-sm">
            {managedNext && (!state.contract || state.contract.kind === "self_serve")
              ? `A contract with your account manager starts on ${formatDate(managedNext.effectiveFrom)}. Contact them to change your plan.`
              : "Your plan is managed by your contract. Contact your account manager to change it."}
          </p>
        )}

        {/* Ruled tiles, like coss.com's pricing: hairlines between the plans. */}
        <div className="grid gap-px overflow-hidden rounded-2xl border bg-border shadow-xs/5 sm:grid-cols-2">
          {PLAN_KEYS.map((key) => {
            const plan = PLANS[key];
            const isCurrent = key === current.key;
            const higher = plan.rank > current.rank;
            return (
              <div
                className={cn(
                  "flex flex-col gap-5 bg-card p-5",
                  isCurrent &&
                    "bg-[color-mix(in_srgb,var(--card),var(--color-black)_3%)] dark:bg-[color-mix(in_srgb,var(--card),var(--color-white)_3%)]",
                )}
                key={key}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-heading font-semibold text-lg tracking-[-0.01em]">
                      {plan.name}
                    </h3>
                    {isCurrent ? (
                      <Badge variant="outline">
                        <StatusDot tone="success">Current</StatusDot>
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-sm">{plan.description}</p>
                </div>
                <p className="font-heading font-semibold text-3xl tabular-nums tracking-[-0.02em]">
                  {price(plan)}
                </p>
                <ul className="flex flex-1 flex-col gap-2 text-sm">
                  {plan.highlights.map((highlight) => (
                    <li className="flex items-start gap-2" key={highlight}>
                      <CheckIcon className="mt-0.5 size-3.5 shrink-0" />
                      {highlight}
                    </li>
                  ))}
                </ul>
                {!canManage || !selfServe || isCurrent ? null : !plan.selfServe ? (
                  <Button
                    render={<a href={`mailto:${SALES_EMAIL}?subject=coss.com%20Enterprise`} />}
                    size="sm"
                    variant="outline"
                  >
                    Contact sales
                  </Button>
                ) : higher ? (
                  <UpgradeButton
                    label={`Upgrade to ${plan.name}`}
                    orgSlug={organization.slug}
                    plan={key}
                  />
                ) : (
                  <DowngradeButton
                    description={`You keep ${current.name} until ${formatDate(changesOn)}, then move to ${plan.name}. ${key === "free" ? "Free stops at 3,000 emails a month." : ""}`}
                    label={key === "free" ? "Cancel plan" : `Switch to ${plan.name}`}
                    orgSlug={organization.slug}
                    plan={key}
                    title={key === "free" ? `Cancel ${current.name}?` : `Switch to ${plan.name}?`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <SettingsSection title="What each plan includes">
          <SettingsTable>
            <TableHeader>
              <TableRow>
                <TableHead />
                {PLAN_KEYS.map((key) => (
                  <TableHead key={key}>{PLANS[key].name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {LIMIT_KEYS.map((limit) => (
                <TableRow key={limit}>
                  <TableCell>{LIMIT_LABELS[limit]}</TableCell>
                  {PLAN_KEYS.map((key) => {
                    const value = PLANS[key].entitlements.limits[limit];
                    return (
                      <TableCell className="font-mono text-xs" key={key}>
                        {value === null ? "Unlimited" : value.toLocaleString("en-US")}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {FEATURE_KEYS.map((feature) => (
                <TableRow key={feature}>
                  <TableCell>{FEATURE_LABELS[feature]}</TableCell>
                  {PLAN_KEYS.map((key) => (
                    <TableCell key={key}>
                      {PLANS[key].entitlements.features[feature] ? (
                        <CheckIcon aria-label="Yes" className="size-4" />
                      ) : addOnGranting(feature)?.plans.includes(key) ? (
                        <span className="text-xs">Add-on</span>
                      ) : (
                        <MinusIcon aria-label="No" className="size-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow>
                <TableCell>Recipients per second</TableCell>
                {PLAN_KEYS.map((key) => (
                  <TableCell className="font-mono text-xs" key={key}>
                    {PLANS[key].entitlements.rateLimits["email.recipients.second"].limit}
                    {PLANS[key].selfServe ? "" : "+"}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </SettingsTable>
        </SettingsSection>

        <SettingsSection
          description="Charged on top of a plan. Add them on the billing page."
          title="Add-ons"
        >
          {ADD_ON_KEYS.map((key) => {
            const addOn: AddOnDefinition = ADD_ONS[key];
            return (
              <SettingsRow
                description={`${formatCents(addOn.unitAmountCents)} per ${addOn.interval}, on the ${addOn.plans.map((plan) => PLANS[plan].name).join(" and ")} plans. ${addOn.description}`}
                key={key}
                label={addOn.name}
              />
            );
          })}
        </SettingsSection>

        <SettingsSection
          description="Billed monthly beyond your plan's credit. Volume tiers apply to each month's usage."
          title="Usage prices"
        >
          {METER_KEYS.filter((meter) => rates[meter]).map((meter) => (
            <SettingsRow
              description={
                <span className="font-mono text-xs">
                  {formatMeterRates(meter, rates[meter]).join("; ")}
                </span>
              }
              key={meter}
              label={METERS[meter].label}
            />
          ))}
        </SettingsSection>
      </SettingsPage>
    </div>
  );
}
