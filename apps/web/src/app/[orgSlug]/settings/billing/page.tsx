import {
  ADD_ON_KEYS,
  ADD_ONS,
  type AddOnDefinition,
  billingOverview,
  catalogAddOn,
  collectInvoiceNow,
  completePaymentSetup,
  listGrants,
  listInvoices,
  METERS,
  type MeterKey,
  meterUnitsName,
  PAYMENT_METHOD_LABELS,
  type PaymentMethodType,
  PLANS,
  paymentMethodCompliant,
  pendingContract,
  periodOf,
  reservedThisPeriod,
  usageByDay,
  usageByEnvironment,
} from "@coss/billing";
import { settingsHref } from "@coss/dashboard-routes";
import { listEnvironments, listProjects } from "@coss/tenancy";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Progress } from "@coss/ui/components/progress";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@coss/ui/components/table";
import { CreditCardIcon, GaugeIcon, ReceiptIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { stringParam } from "@/components/admin/list-controls";
import { InvoiceStatusBadge } from "@/components/billing/invoice-status";
import { StackedBars } from "@/components/charts/stacked-bars";
import { EmptyState } from "@/components/empty-state";
import {
  SettingsNote,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SettingsTable,
} from "@/components/settings";
import { SupportLink } from "@/components/support/support-link";
import { env } from "@/env";
import { recordAudit } from "@/lib/audit";
import { billingRuntime, systemOrganizationId } from "@/lib/billing";
import {
  centsInput,
  formatCents,
  formatDate,
  formatPeriodRange,
  formatQuantity,
} from "@/lib/billing-format";
import { requireOrgMember } from "@/lib/session";
import {
  AddOnButton,
  CancelScheduledChangeButton,
  PaymentMethodButtons,
  RemoveAddOnButton,
  SpendControlsForm,
} from "./billing-forms";

export const metadata: Metadata = { title: "Billing" };

const NOTICES: Record<string, { variant: "success" | "warning" | "error" | "info"; text: string }> =
  {
    upgraded: { variant: "success", text: "Your plan was updated. Thanks!" },
    processing: {
      variant: "info",
      text: "Your payment is processing. Your plan changes as soon as it clears.",
    },
    requires_action: {
      variant: "warning",
      text: "Your bank needs you to confirm the payment: open the invoice below to finish.",
    },
    payment_failed: {
      variant: "error",
      text: "The payment failed. Try another payment method, then upgrade again.",
    },
    payment_method_added: { variant: "success", text: "Your payment method was saved." },
  };

/**
 * The customer came back from the provider's setup page (`?setup=`): save the method and, when an
 * upgrade waited for it (`?upgrade=`, the org's own pending upgrade invoice), charge it now.
 */
async function finishSetup(
  context: Awaited<ReturnType<typeof requireOrgMember>>,
  sessionId: string,
  upgradeInvoiceId: string,
): Promise<string> {
  const runtime = billingRuntime();
  const organizationId = context.organization.id;
  const account = await completePaymentSetup({
    organizationId,
    defaultProvider: runtime.defaultProvider,
    providers: runtime.providers,
    sessionId,
  });
  if (account.paymentMethod) {
    await recordAudit(context.session, {
      organizationId,
      action: "billing.payment_method_added",
      metadata: { type: account.paymentMethod.type },
    });
  }
  const pending = upgradeInvoiceId ? await pendingContract(organizationId) : null;
  if (!pending || pending.pendingInvoiceId !== upgradeInvoiceId) return "payment_method_added";
  if (!account.paymentMethod) return "payment_failed";
  const collected = await collectInvoiceNow(upgradeInvoiceId, {
    providers: runtime.providers,
    dashboardUrl: env.BETTER_AUTH_URL,
    systemOrganizationId: await systemOrganizationId(),
  });
  switch (collected?.state) {
    case "paid":
      return "upgraded";
    case "failed":
      return "payment_failed";
    case "requires_action":
      return "requires_action";
    default:
      return "processing";
  }
}

async function environmentLabels(organizationId: string): Promise<Map<string, string>> {
  const projects = await listProjects({ organizationId });
  const environments = await Promise.all(
    projects.map((project) => listEnvironments({ organizationId, projectId: project.id })),
  );
  const labels = new Map<string, string>();
  projects.forEach((project, index) => {
    for (const environment of environments[index] ?? []) {
      labels.set(environment.id, `${project.name} / ${environment.name}`);
    }
  });
  return labels;
}

export default async function BillingPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/settings/billing">) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const context = await requireOrgMember(orgSlug);
  const { organization, can } = context;
  if (!can({ billing: ["read"] })) notFound();
  const canManage = can({ billing: ["update"] });
  const setup = stringParam(query.setup);
  if (setup && canManage) {
    const notice = await finishSetup(context, setup, stringParam(query.upgrade));
    redirect(`/${organization.slug}/settings/billing?notice=${notice}`);
  }
  const notice = NOTICES[stringParam(query.notice)];

  const now = new Date();
  const period = periodOf(now);
  const [overview, invoices, grants, byDay, byEnvironment, labels] = await Promise.all([
    billingOverview(organization.id, now),
    listInvoices(organization.id, { limit: 24 }),
    listGrants(organization.id),
    usageByDay(organization.id, period),
    usageByEnvironment(organization.id, period),
    environmentLabels(organization.id),
  ]);
  const { account, state, pending, estimate, holds } = overview;
  const plan = PLANS[state.terms.plan];
  const contract = state.contract;
  const selfServe = !contract || contract.kind === "self_serve";
  const provider = account?.provider ?? billingRuntime().defaultProvider;
  const capped = Object.entries(state.terms.usageCaps).filter(([, cap]) => cap > 0) as [
    MeterKey,
    number,
  ][];
  const reserved = await Promise.all(
    capped.map(([meter]) => reservedThisPeriod(organization.id, meter, now)),
  );
  const pendingInvoice = pending
    ? invoices.find((invoice) => invoice.id === pending.pendingInvoiceId)
    : undefined;
  // A scheduled change or pending upgrade that keeps the plan only changes add-ons.
  const planChangeScheduled = state.scheduled && state.scheduled.terms.plan !== state.terms.plan;
  const pendingPlanChange = pending && pending.terms.plan !== state.terms.plan;
  const addOns = state.terms.addOns;
  const nextAddOns = state.scheduled ? state.scheduled.terms.addOns : addOns;
  const pendingAddOns = (pending?.terms.addOns ?? []).filter(
    (line) => !addOns.some((current) => current.key === line.key),
  );
  const addOnRows = [
    ...ADD_ON_KEYS.map((key) => ({ key, catalog: ADD_ONS[key] as AddOnDefinition })),
    ...addOns
      .filter((line) => !catalogAddOn(line.key))
      .map((line) => ({ key: line.key, catalog: null })),
  ];

  // Usage this month, per meter (dimensions together), with the estimated charge.
  const meters = new Map<MeterKey, { quantity: number; covered: number; cents: bigint }>();
  for (const line of estimate.composition.lines) {
    if (!line.meter) continue;
    const row = meters.get(line.meter) ?? { quantity: 0, covered: 0, cents: 0n };
    if (line.kind === "usage") {
      row.quantity += line.quantity ?? 0;
      row.covered += line.coveredUnits ?? 0;
    }
    if (line.kind !== "credit") row.cents += line.amountCents;
    meters.set(line.meter, row);
  }
  const dailyEmail = byDay.filter((row) => row.meter === "email.recipients");
  const activeGrants = grants.filter(
    (grant) =>
      !grant.voidedAt && grant.remaining > 0n && (!grant.expiresAt || grant.expiresAt > now),
  );

  const daysLeft = Math.max(0, Math.ceil((period.end.getTime() - now.getTime()) / 86_400_000));

  return (
    <SettingsPage>
      {notice ? (
        <Alert variant={notice.variant}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}
      {holds.length ? (
        <Alert variant="error">
          <AlertTitle>Live sending is paused</AlertTitle>
          <AlertDescription>
            {holds.some((hold) => hold.reason === "delinquent")
              ? "An invoice is overdue. Pay it below and sending resumes right away."
              : holds.some((hold) => hold.reason === "spend_limit")
                ? "This month's usage reached your spend limit. Raise it below, or sending resumes next month."
                : "coss.com paused live sending for billing reasons."}{" "}
            {holds.some(
              (hold) => hold.reason === "delinquent" || hold.reason === "spend_limit",
            ) ? null : (
              <>
                <SupportLink
                  orgSlug={context.organization.slug}
                  subject="Billing hold"
                  topic="billing"
                />
                .{" "}
              </>
            )}
            Sandbox keys keep working.
          </AlertDescription>
        </Alert>
      ) : account?.status === "past_due" ? (
        <Alert variant="warning">
          <AlertDescription>
            An invoice is past due. Pay it within {account.graceDays} days of its due date to avoid
            a pause in live sending.
          </AlertDescription>
        </Alert>
      ) : null}

      <SettingsSection
        action={
          <Button
            render={<Link href={`/${organization.slug}/settings/billing/plans`} />}
            size="sm"
            variant="outline"
          >
            Compare plans
          </Button>
        }
        title="Plan"
      >
        <SettingsRow
          description={
            state.terms.fee
              ? `${formatCents(state.terms.fee.amountCents)} per ${state.terms.fee.interval}${state.terms.feeCredit.spendable ? ", all of it spendable on usage" : ""}.`
              : plan.description
          }
          label={<span className="font-heading text-base tracking-[-0.01em]">{plan.name}</span>}
        >
          <Badge variant="outline">
            {contract && contract.kind !== "self_serve" ? "Contract" : "Self-serve"}
          </Badge>
        </SettingsRow>
        <BillingFigures>
          <BillingFigure
            detail={
              estimate.totals.creditCents > 0n
                ? `${formatCents(estimate.totals.creditCents)} paid by credit`
                : "Live usage so far"
            }
            label="Usage this month"
            value={formatCents(estimate.usageCents)}
          />
          <BillingFigure
            detail={state.terms.fee ? "Plus next month's fee" : "At the end of the month"}
            label="To pay"
            value={formatCents(estimate.totals.totalCents)}
          />
          <BillingFigure
            detail={`${daysLeft} days left`}
            label="Billing period"
            value={formatPeriodRange(period.start, period.end)}
          />
        </BillingFigures>
        {contract?.termEnd ? (
          <SettingsNote>
            Committed term until {formatDate(contract.termEnd)}
            {contract.autoRenew ? ", renewing automatically" : ""}.
          </SettingsNote>
        ) : null}
        {state.scheduled && planChangeScheduled ? (
          <SettingsRow
            description={`On ${formatDate(state.scheduled.at)}.`}
            label={`Changes to the ${PLANS[state.scheduled.terms.plan].name} plan`}
          >
            {canManage &&
            selfServe &&
            (!state.scheduled.contract || state.scheduled.contract.kind === "self_serve") ? (
              <CancelScheduledChangeButton label="Keep my plan" orgSlug={organization.slug} />
            ) : null}
          </SettingsRow>
        ) : null}
        {pending && pendingPlanChange ? (
          <SettingsNote className="text-foreground">
            The upgrade to {PLANS[pending.terms.plan].name} is waiting for its payment
            {pendingInvoice?.hostedUrl ? (
              <>
                {" "}
                (
                <a
                  className="underline underline-offset-4"
                  href={pendingInvoice.hostedUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  pay the invoice
                </a>
                )
              </>
            ) : null}
            .
          </SettingsNote>
        ) : null}
        {selfServe ? null : (
          <SettingsNote>
            Your plan is managed by your contract. Contact your account manager to change it.
          </SettingsNote>
        )}
      </SettingsSection>

      <SettingsSection
        description="Charged monthly on top of your plan (prorated when added mid-month)."
        title="Add-ons"
      >
        {addOnRows.map(({ key, catalog }) => {
          const line = addOns.find((current) => current.key === key);
          const name = catalog?.name ?? line?.name ?? key;
          const ends = line && !nextAddOns.some((next) => next.key === key);
          const waiting = pendingAddOns.find((next) => next.key === key);
          const eligible = catalog?.plans.includes(state.terms.plan) ?? false;
          const price = line
            ? `${formatCents(line.unitAmountCents * BigInt(line.quantity))} per ${line.interval}`
            : catalog
              ? `${formatCents(catalog.unitAmountCents)} per ${catalog.interval}`
              : "";
          const manageable = canManage && selfServe && catalog?.selfServe;
          return (
            <SettingsRow
              description={
                <>
                  {price}
                  {catalog ? `. ${catalog.description}` : "."}
                  {waiting ? (
                    <span className="block text-foreground">
                      Waiting for its payment
                      {pendingInvoice?.hostedUrl ? (
                        <>
                          {" "}
                          (
                          <a
                            className="underline underline-offset-4"
                            href={pendingInvoice.hostedUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            pay the invoice
                          </a>
                          )
                        </>
                      ) : null}
                      .
                    </span>
                  ) : null}
                  {!line && catalog && !eligible ? (
                    <span className="block text-foreground">
                      Available on the {catalog.plans.map((plan) => PLANS[plan].name).join(" and ")}{" "}
                      plans.
                    </span>
                  ) : null}
                </>
              }
              key={key}
              label={
                <>
                  {name}
                  {line ? (
                    <Badge variant="outline">
                      {ends && state.scheduled
                        ? `Ends ${formatDate(state.scheduled.at)}`
                        : "Active"}
                    </Badge>
                  ) : null}
                </>
              }
            >
              {manageable && line && !ends ? (
                <RemoveAddOnButton
                  addOn={key}
                  description={`${name} stays until the end of this billing month${state.scheduled ? "" : ` (${formatDate(period.end)})`}, then stops. You can undo it until then.`}
                  name={name}
                  orgSlug={organization.slug}
                />
              ) : manageable && ends && !planChangeScheduled ? (
                <CancelScheduledChangeButton label="Keep it" orgSlug={organization.slug} />
              ) : manageable && !line && eligible && !waiting && !state.scheduled ? (
                <AddOnButton addOn={key} label="Add" orgSlug={organization.slug} />
              ) : null}
            </SettingsRow>
          );
        })}
      </SettingsSection>

      <SettingsSection
        description={`Live usage only (sandbox is free), ${formatPeriodRange(period.start, period.end)}.`}
        title="Usage this month"
      >
        {capped.map(([meter, cap], index) => {
          const used = Math.min(reserved[index] ?? 0, cap);
          return (
            <div className="flex flex-col gap-2 border-t px-5 py-4" key={meter}>
              <div className="flex justify-between gap-4 text-sm">
                <span className="font-medium">{sentenceCase(meterUnitsName(meter))} included</span>
                <span className="font-mono text-muted-foreground text-xs tabular-nums">
                  {used.toLocaleString("en-US")} / {cap.toLocaleString("en-US")}
                </span>
              </div>
              <Progress max={cap} value={used} />
            </div>
          );
        })}
        {dailyEmail.length ? (
          <div className="border-t px-5 py-5">
            <StackedBars
              columns={dailyEmail.map((row) => ({
                label: formatDate(row.day),
                values: { recipients: row.quantity },
              }))}
              label="Email recipients per day this month"
              series={[
                { key: "recipients", label: "Email recipients", className: "bg-foreground/72" },
              ]}
            />
          </div>
        ) : null}
        {meters.size ? (
          <SettingsTable>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Usage</TableHead>
                <TableHead className="text-right">Included</TableHead>
                <TableHead className="text-right">Charge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...meters].map(([meter, row]) => (
                <TableRow key={meter}>
                  <TableCell className="font-medium">{METERS[meter].label}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {row.quantity.toLocaleString("en-US")} {METERS[meter].units}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {row.covered ? row.covered.toLocaleString("en-US") : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {formatCents(row.cents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </SettingsTable>
        ) : (
          <EmptyState
            className="border-t"
            compact
            description="Live emails and other metered usage show up here as they happen."
            icon={GaugeIcon}
            title="No usage yet this month"
          />
        )}
      </SettingsSection>

      {byEnvironment.length ? (
        <SettingsSection title="Usage by environment">
          <SettingsTable>
            <TableHeader>
              <TableRow>
                <TableHead>Environment</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Usage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byEnvironment.map((row) => (
                <TableRow key={`${row.environmentId}:${row.meter}`}>
                  <TableCell>
                    {row.environmentId === ""
                      ? "Organization"
                      : (labels.get(row.environmentId) ?? "Deleted environment")}
                  </TableCell>
                  <TableCell>{METERS[row.meter]?.label ?? row.meter}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {formatQuantity(row.quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </SettingsTable>
        </SettingsSection>
      ) : null}

      {activeGrants.length ? (
        <SettingsSection description="Applied to usage before anything is charged." title="Credits">
          <SettingsTable>
            <TableHeader>
              <TableRow>
                <TableHead>Credit</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeGrants.map((grant) => (
                <TableRow key={grant.id}>
                  <TableCell>{grant.description}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {grant.kind === "amount"
                      ? `${formatCents(grant.remaining)} of ${formatCents(grant.amount)}`
                      : `${grant.remaining.toLocaleString("en-US")} ${grant.meter && grant.meter in METERS ? METERS[grant.meter as MeterKey].units : "units"}`}
                  </TableCell>
                  <TableCell className="text-right">
                    {grant.expiresAt ? formatDate(grant.expiresAt) : "Never"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </SettingsTable>
        </SettingsSection>
      ) : null}

      <SettingsSection title="Invoices">
        {invoices.length ? (
          <SettingsTable>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link
                      className="font-medium font-mono text-[0.8125rem] underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`/${organization.slug}/settings/billing/invoices/${invoice.id}`}
                    >
                      {invoice.number}
                    </Link>
                  </TableCell>
                  <TableCell>{formatPeriodRange(invoice.periodStart, invoice.periodEnd)}</TableCell>
                  <TableCell>
                    <InvoiceStatusBadge
                      overdue={Boolean(invoice.dueAt && invoice.dueAt < now)}
                      paymentState={invoice.paymentState}
                      status={invoice.status}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {formatCents(invoice.totalCents)}
                  </TableCell>
                  <TableCell className="text-right">
                    {invoice.status === "open" ? formatDate(invoice.dueAt) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </SettingsTable>
        ) : (
          <EmptyState
            className="border-t"
            compact
            description="Each month's invoice appears here once the month closes."
            icon={ReceiptIcon}
            title="No invoices yet"
          />
        )}
      </SettingsSection>

      <SettingsSection title="Payment method">
        <SettingsRow
          description={
            provider === "manual"
              ? `Invoiced directly${account?.collectionMethod === "send_invoice" ? `, due ${account.netTermsDays} days after issue` : ""}. Contact billing to change how you pay.`
              : account?.collectionMethod === "send_invoice"
                ? `Invoices are emailed and due ${account.netTermsDays} days after issue.`
                : "Invoices are charged to your default payment method."
          }
          label={
            account?.paymentMethod ? (
              <>
                <CreditCardIcon className="size-4 text-muted-foreground" />
                <span>
                  {PAYMENT_METHOD_LABELS[account.paymentMethod.type as PaymentMethodType] ??
                    account.paymentMethod.type}
                  {account.paymentMethod.brand ? ` (${account.paymentMethod.brand})` : ""}
                  {account.paymentMethod.last4 ? (
                    <span className="font-mono font-normal">
                      {" "}
                      ···· {account.paymentMethod.last4}
                    </span>
                  ) : null}
                  {account.paymentMethod.expMonth && account.paymentMethod.expYear ? (
                    <span className="font-normal text-muted-foreground">
                      , expires {account.paymentMethod.expMonth}/{account.paymentMethod.expYear}
                    </span>
                  ) : null}
                </span>
              </>
            ) : provider === "manual" ? (
              "Invoice"
            ) : (
              "No payment method yet"
            )
          }
        >
          {canManage && provider !== "manual" ? (
            <PaymentMethodButtons
              hasMethod={Boolean(account?.paymentMethod)}
              orgSlug={organization.slug}
              portal={provider === "stripe"}
            />
          ) : null}
        </SettingsRow>
        {account && !paymentMethodCompliant(account) ? (
          <SettingsNote>
            <Alert variant="warning">
              <AlertDescription>
                Your contract requires paying by{" "}
                {account.requiredPaymentMethods
                  .map((type) => PAYMENT_METHOD_LABELS[type as PaymentMethodType] ?? type)
                  .join(" or ")}
                . Replace your payment method.
              </AlertDescription>
            </Alert>
          </SettingsNote>
        ) : null}
      </SettingsSection>

      <SettingsSection
        description={
          <>
            {canManage
              ? "Limits and alerts for usage beyond your plan."
              : "Only owners can change these."}{" "}
            Budgets for members, projects and API keys are on the{" "}
            <Link className="underline" href={settingsHref(organization.slug, "/spend/budgets")}>
              Spend
            </Link>{" "}
            page.
          </>
        }
        id="spend-controls"
        title="Spend controls"
      >
        <SpendControlsForm
          alertThresholds={(account?.alertThresholds ?? [80, 100]).join(", ")}
          billingEmail={account?.billingEmail ?? ""}
          disabled={!canManage}
          orgSlug={organization.slug}
          spendLimit={centsInput(account?.spendLimitCents)}
        />
      </SettingsSection>
    </SettingsPage>
  );
}

/** The plan's running figures, ruled into cells inside the Plan card. */
function BillingFigures(props: { children: ReactNode }) {
  return (
    <div className="grid border-t sm:grid-cols-3 sm:divide-x max-sm:divide-y">{props.children}</div>
  );
}

function BillingFigure(props: { label: ReactNode; value: ReactNode; detail: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-5 py-4">
      <div className="text-muted-foreground text-xs">{props.label}</div>
      <div className="truncate font-heading font-semibold text-lg tabular-nums tracking-[-0.01em]">
        {props.value}
      </div>
      <div className="truncate text-muted-foreground text-xs">{props.detail}</div>
    </div>
  );
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
