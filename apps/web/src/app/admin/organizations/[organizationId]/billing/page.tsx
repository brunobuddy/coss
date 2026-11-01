import {
  billingOverview,
  listBillingPeriods,
  listContracts,
  listCreditNotes,
  listGrants,
  listInvoices,
  METER_KEYS,
  METERS,
  type MeterKey,
  organizationLabel,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_TYPES,
  PLANS,
} from "@coss/billing";
import { Badge } from "@coss/ui/components/badge";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { Textarea } from "@coss/ui/components/textarea";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { AdminOrganizationTabs } from "@/components/admin/organization-tabs";
import { InvoiceStatusBadge } from "@/components/billing/invoice-status";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/panel";
import { defaultBillingProvider } from "@/lib/billing";
import { centsInput, formatCents, formatDate, formatPeriodRange } from "@/lib/billing-format";
import { requirePlatformAdmin } from "@/lib/session";
import { AccountSettingsForm } from "./account-settings-form";
import {
  creditNoteAction,
  endContractAction,
  grantCreditAction,
  markUncollectibleAction,
  oneOffInvoiceAction,
  recordPaymentAction,
  resyncInvoiceAction,
  setHoldAction,
  voidCreditAction,
  voidInvoiceAction,
} from "./actions";
import { ContractEditor } from "./contract-editor";

export const metadata: Metadata = { title: "Organization billing" };

function SelectInput(props: {
  name: string;
  defaultValue: string;
  items: { value: string; label: string }[];
}) {
  return (
    <Select defaultValue={props.defaultValue} items={props.items} name={props.name}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {props.items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

const METER_ITEMS = METER_KEYS.map((meter) => ({ value: meter, label: METERS[meter].label }));

export default async function AdminOrganizationBillingPage({
  params,
}: PageProps<"/admin/organizations/[organizationId]/billing">) {
  await requirePlatformAdmin();
  const { organizationId } = await params;
  const organization = await organizationLabel(organizationId);
  if (!organization) notFound();
  const now = new Date();
  const [overview, contracts, grants, invoices, periods, creditNotes] = await Promise.all([
    billingOverview(organization.id, now),
    listContracts(organization.id),
    listGrants(organization.id),
    listInvoices(organization.id, { limit: 100 }),
    listBillingPeriods(organization.id),
    listCreditNotes(organization.id),
  ]);
  const { account, state, estimate, holds } = overview;
  const fields = { organizationId: organization.id };
  const adminHold = holds.some((hold) => hold.reason === "admin");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <PageHeader
          meta={
            <>
              <code className="font-mono text-xs">/{organization.slug}</code>
              <code className="font-mono text-xs">{organization.id}</code>
            </>
          }
          title={organization.name}
        />
        <AdminOrganizationTabs organizationId={organization.id} />
      </div>

      <Panel>
        <PanelHeader>
          <PanelTitle className="flex items-center gap-2">
            {PLANS[state.terms.plan].name}
            {state.contract ? (
              <Badge variant="info">{state.contract.kind.replace("_", "-")}</Badge>
            ) : null}
            {account?.status && account.status !== "active" ? (
              <Badge variant="error">{account.status.replace("_", " ")}</Badge>
            ) : null}
            {holds.map((hold) => (
              <Badge key={hold.reason} variant="error">
                hold: {hold.reason.replace("_", " ")}
              </Badge>
            ))}
          </PanelTitle>
          <PanelDescription>
            Provider {account?.provider ?? `${defaultBillingProvider()} (no account yet)`}
            {account?.providerCustomerId ? ` · customer ${account.providerCustomerId}` : ""}
            {account?.paymentMethod
              ? ` · ${account.paymentMethod.type}${account.paymentMethod.last4 ? ` ${account.paymentMethod.last4}` : ""}`
              : " · no payment method"}
            . This month so far: {formatCents(estimate.usageCents)} of usage,{" "}
            {formatCents(estimate.totals.totalCents)} to invoice.
            {state.scheduled
              ? ` Changes to ${PLANS[state.scheduled.terms.plan].name} on ${formatDate(state.scheduled.at)}.`
              : ""}
          </PanelDescription>
        </PanelHeader>
        <PanelBody className="flex flex-row flex-wrap gap-2">
          <AdminActionDialog
            icon="billing"
            action={setHoldAction}
            description={
              adminHold
                ? "Live sending resumes (unless another billing hold remains)."
                : "Live sends are refused and scheduled ones held until you lift it. Sandbox keeps working."
            }
            destructive={!adminHold}
            fields={{ ...fields, held: adminHold ? "false" : "true" }}
            reason="required"
            submitLabel={adminHold ? "Lift hold" : "Pause sending"}
            success={adminHold ? "Billing hold lifted" : "Live sending paused"}
            title={adminHold ? "Lift the billing hold?" : "Pause live sending for billing?"}
            triggerLabel={adminHold ? "Lift admin hold" : "Pause live sending"}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Billing settings</PanelTitle>
          <PanelDescription>How this organization is invoiced and pays.</PanelDescription>
        </PanelHeader>
        <PanelBody>
          <AccountSettingsForm
            methods={PAYMENT_METHOD_TYPES.map((type) => ({
              value: type,
              label: PAYMENT_METHOD_LABELS[type],
            }))}
            organizationId={organization.id}
            values={{
              provider: account?.provider ?? defaultBillingProvider(),
              collectionMethod: account?.collectionMethod ?? "charge_automatically",
              netTermsDays: account?.netTermsDays ?? 30,
              allowedPaymentMethods: account?.allowedPaymentMethods ?? ["card"],
              requiredPaymentMethods: account?.requiredPaymentMethods ?? [],
              taxMode: account?.taxMode ?? "none",
              billingEmail: account?.billingEmail ?? "",
              billingCc: account?.billingCc.join(", ") ?? "",
              billingName: account?.billingName ?? "",
              taxId: account?.taxId ?? "",
              graceDays: account?.graceDays ?? 14,
              holdExemptUntil: account?.holdExemptUntil?.toISOString().slice(0, 10) ?? "",
              notes: account?.notes ?? "",
            }}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Contracts</PanelTitle>
          <PanelDescription>No contract in effect means the Free plan.</PanelDescription>
        </PanelHeader>
        <PanelBody>
          {contracts.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>In effect</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => {
                  const ended = contract.effectiveUntil !== null && contract.effectiveUntil <= now;
                  const live = contract.status !== "canceled" && !ended;
                  return (
                    <TableRow key={contract.id}>
                      <TableCell>
                        <span
                          title={JSON.stringify(
                            contract.terms,
                            (_key, value) => (typeof value === "bigint" ? value.toString() : value),
                            2,
                          )}
                        >
                          {PLANS[contract.terms.plan].name}
                        </span>
                      </TableCell>
                      <TableCell>{contract.kind.replace("_", "-")}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            contract.status === "confirmed" && !ended ? "success" : "outline"
                          }
                        >
                          {ended ? "ended" : contract.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(contract.effectiveFrom)} –{" "}
                        {contract.effectiveUntil
                          ? formatDate(contract.effectiveUntil)
                          : "open-ended"}
                      </TableCell>
                      <TableCell>
                        {contract.termEnd
                          ? `until ${formatDate(contract.termEnd)}${contract.autoRenew ? ", renews" : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-48 truncate">
                        {contract.reference ?? contract.note ?? "—"}
                      </TableCell>
                      <TableCell>
                        {live ? (
                          <AdminActionDialog
                            icon="contract"
                            action={endContractAction}
                            description="Ending it now bills nothing more for it; what follows is the Free plan unless another contract starts."
                            destructive
                            fields={{ ...fields, contractId: contract.id }}
                            reason="required"
                            submitLabel="End contract"
                            success="Contract ended"
                            title="End this contract?"
                            triggerLabel="End"
                          >
                            <Field>
                              <FieldLabel>When</FieldLabel>
                              <SelectInput
                                defaultValue="now"
                                items={[
                                  { value: "now", label: "Now" },
                                  { value: "next_month", label: "At the start of next month" },
                                ]}
                                name="at"
                              />
                            </Field>
                          </AdminActionDialog>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">No contracts: the Free plan.</p>
          )}
        </PanelBody>
      </Panel>

      <div className="flex flex-col gap-2">
        <h2 className="font-heading font-semibold text-lg">New contract</h2>
        <ContractEditor currentPlan={state.terms.plan} organizationId={organization.id} />
      </div>

      <Panel>
        <PanelHeader>
          <PanelTitle>Credits</PanelTitle>
          <PanelDescription>
            Dollars or free units, used before anything is charged.
          </PanelDescription>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-4">
          <div>
            <AdminActionDialog
              icon="credit"
              action={grantCreditAction}
              description="The customer sees the description; the reason stays internal."
              fields={fields}
              reason="required"
              submitLabel="Grant credit"
              success="Credit granted"
              title="Grant credit"
              triggerLabel="Grant credit"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Kind</FieldLabel>
                  <SelectInput
                    defaultValue="amount"
                    items={[
                      { value: "amount", label: "Dollars" },
                      { value: "units", label: "Free units" },
                    ]}
                    name="kind"
                  />
                </Field>
                <Field>
                  <FieldLabel>Amount</FieldLabel>
                  <Input name="amount" placeholder="100 (USD) or 50000 (units)" required />
                </Field>
                <Field>
                  <FieldLabel>Units of (free units)</FieldLabel>
                  <SelectInput defaultValue="email.recipients" items={METER_ITEMS} name="meter" />
                </Field>
                <Field>
                  <FieldLabel>Pays for (dollars)</FieldLabel>
                  <SelectInput
                    defaultValue=""
                    items={[{ value: "", label: "Any product" }, ...METER_ITEMS]}
                    name="scope"
                  />
                </Field>
                <Field>
                  <FieldLabel>Applies to</FieldLabel>
                  <SelectInput
                    defaultValue="usage"
                    items={[
                      { value: "usage", label: "Usage only" },
                      { value: "any", label: "Anything (fees too)" },
                    ]}
                    name="appliesTo"
                  />
                </Field>
                <Field>
                  <FieldLabel>Source</FieldLabel>
                  <SelectInput
                    defaultValue="support"
                    items={[
                      { value: "support", label: "Support" },
                      { value: "promotion", label: "Promotion" },
                      { value: "sla", label: "SLA credit" },
                      { value: "refund", label: "Refund" },
                    ]}
                    name="source"
                  />
                </Field>
                <Field>
                  <FieldLabel>Starts</FieldLabel>
                  <Input name="effectiveAt" type="date" />
                  <FieldDescription>Empty: now.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Expires</FieldLabel>
                  <Input name="expiresAt" type="date" />
                  <FieldDescription>Empty: never.</FieldDescription>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel>Description (shown to the customer)</FieldLabel>
                  <Input name="description" placeholder="Migration credit" required />
                </Field>
              </div>
            </AdminActionDialog>
          </div>
          {grants.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credit</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Valid</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((grant) => (
                  <TableRow
                    className={grant.voidedAt ? "text-muted-foreground line-through" : undefined}
                    key={grant.id}
                  >
                    <TableCell>
                      {grant.description}
                      {grant.reason ? (
                        <span className="block text-muted-foreground text-xs">{grant.reason}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{grant.source}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {grant.kind === "amount"
                        ? `${formatCents(grant.remaining)} / ${formatCents(grant.amount)}`
                        : `${grant.remaining.toLocaleString("en-US")} / ${grant.amount.toLocaleString("en-US")} ${grant.meter && grant.meter in METERS ? METERS[grant.meter as MeterKey].units : "units"}`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(grant.effectiveAt)} –{" "}
                      {grant.expiresAt ? formatDate(grant.expiresAt) : "never"}
                    </TableCell>
                    <TableCell>
                      {!grant.voidedAt && grant.remaining > 0n && grant.source !== "fee" ? (
                        <AdminActionDialog
                          icon="credit"
                          action={voidCreditAction}
                          description="What's left of it can't be used any more; what invoices already used stays used."
                          destructive
                          fields={{ ...fields, grantId: grant.id }}
                          reason="required"
                          submitLabel="Void credit"
                          success="Credit voided"
                          title="Void this credit?"
                          triggerLabel="Void"
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Invoices</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-4">
          <div>
            <AdminActionDialog
              icon="invoice"
              action={oneOffInvoiceAction}
              description="Finalized and collected like any invoice (charged or sent, per the account's settings)."
              fields={fields}
              reason="required"
              submitLabel="Create invoice"
              success="Invoice created"
              title="One-off invoice"
              triggerLabel="One-off invoice"
            >
              <Field>
                <FieldLabel>Lines</FieldLabel>
                <Textarea
                  name="lines"
                  placeholder={"Onboarding | 5,000\nMigration discount | -500"}
                  required
                  rows={4}
                />
                <FieldDescription>One per line: description | amount in USD.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Memo (on the invoice)</FieldLabel>
                <Input name="memo" />
              </Field>
            </AdminActionDialog>
          </div>
          {invoices.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const invoiceFields = { ...fields, invoiceId: invoice.id };
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <span className="block">{invoice.number}</span>
                        <span className="text-muted-foreground text-xs">
                          {invoice.kind.replace("_", " ")} · {invoice.provider}
                          {invoice.syncError ? ` · sync: ${invoice.syncError}` : ""}
                          {invoice.paymentError ? ` · ${invoice.paymentError}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatPeriodRange(invoice.periodStart, invoice.periodEnd)}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge
                          overdue={Boolean(invoice.dueAt && invoice.dueAt < now)}
                          paymentState={invoice.paymentState}
                          status={invoice.status}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCents(invoice.totalCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCents(invoice.amountDueCents)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {invoice.status === "open" ? (
                            <>
                              <AdminActionDialog
                                icon="invoice"
                                action={recordPaymentAction}
                                description="A payment received outside the provider (wire, check)."
                                fields={invoiceFields}
                                reason="required"
                                submitLabel="Record payment"
                                success="Payment recorded"
                                title={`Record a payment for ${invoice.number}`}
                                triggerLabel="Paid"
                              >
                                <Field>
                                  <FieldLabel>Amount (USD)</FieldLabel>
                                  <Input
                                    defaultValue={centsInput(invoice.amountDueCents)}
                                    name="amount"
                                    required
                                  />
                                </Field>
                                <Field>
                                  <FieldLabel>Method</FieldLabel>
                                  <SelectInput
                                    defaultValue="wire"
                                    items={[
                                      { value: "wire", label: "Wire transfer" },
                                      { value: "ach", label: "ACH" },
                                      { value: "check", label: "Check" },
                                      { value: "other", label: "Other" },
                                    ]}
                                    name="method"
                                  />
                                </Field>
                                <Field>
                                  <FieldLabel>Reference</FieldLabel>
                                  <Input name="reference" />
                                </Field>
                                <Field>
                                  <FieldLabel>Received</FieldLabel>
                                  <Input name="receivedAt" type="date" />
                                </Field>
                              </AdminActionDialog>
                              <AdminActionDialog
                                icon="invoice"
                                action={resyncInvoiceAction}
                                description="Pushes it to the provider again, or tries the charge again."
                                fields={invoiceFields}
                                reason="required"
                                submitLabel="Retry"
                                success={`Retried ${invoice.number}`}
                                title={`Retry ${invoice.number}?`}
                                triggerLabel="Retry"
                              />
                              {invoice.amountPaidCents === 0n ? (
                                <AdminActionDialog
                                  icon="invoice"
                                  action={voidInvoiceAction}
                                  description="Its charges can be billed again and its credits are given back."
                                  destructive
                                  fields={invoiceFields}
                                  reason="required"
                                  submitLabel="Void invoice"
                                  success={`${invoice.number} voided`}
                                  title={`Void ${invoice.number}?`}
                                  triggerLabel="Void"
                                />
                              ) : null}
                              <AdminActionDialog
                                icon="invoice"
                                action={markUncollectibleAction}
                                description="It stops being collected and no longer counts as overdue."
                                destructive
                                fields={invoiceFields}
                                reason="required"
                                submitLabel="Write off"
                                success={`${invoice.number} written off`}
                                title={`Write off ${invoice.number}?`}
                                triggerLabel="Write off"
                              />
                            </>
                          ) : null}
                          {invoice.status === "open" || invoice.status === "paid" ? (
                            <AdminActionDialog
                              icon="invoice"
                              action={creditNoteAction}
                              description="Reduces the invoice. On a paid one, the refund goes back to the payment method and the rest becomes credit."
                              fields={invoiceFields}
                              reason="required"
                              submitLabel="Issue credit note"
                              success="Credit note issued"
                              title={`Credit note for ${invoice.number}`}
                              triggerLabel="Credit note"
                            >
                              <Field>
                                <FieldLabel>Amount (USD)</FieldLabel>
                                <Input name="amount" required />
                              </Field>
                              <Field>
                                <FieldLabel>Refunded to the payment method (USD)</FieldLabel>
                                <Input name="refund" placeholder="0" />
                              </Field>
                              <Field>
                                <FieldLabel>Memo (shown to the customer)</FieldLabel>
                                <Input name="memo" required />
                              </Field>
                            </AdminActionDialog>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">No invoices.</p>
          )}
          {creditNotes.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {creditNotes.map((note) => (
                <li key={note.id}>
                  {note.number}: {formatCents(note.amountCents)}
                  {note.refundCents > 0n ? ` (${formatCents(note.refundCents)} refunded)` : ""} ·{" "}
                  {note.memo} · {note.status}
                </li>
              ))}
            </ul>
          ) : null}
        </PanelBody>
      </Panel>

      {periods.length ? (
        <Panel>
          <PanelHeader>
            <PanelTitle>Closed months</PanelTitle>
          </PanelHeader>
          <PanelBody>
            <ul className="flex flex-col gap-1 text-sm">
              {periods.map((period) => (
                <li key={period.id}>
                  {formatPeriodRange(period.periodStart, period.periodEnd)}:{" "}
                  {period.usage
                    .map(
                      (row) =>
                        `${row.quantity.toLocaleString("en-US")} ${row.meter}${row.dimension ? ` (${row.dimension})` : ""}`,
                    )
                    .join(", ") || "no usage"}
                  {period.invoiceId ? "" : " · nothing billed"}
                  {period.warnings.length ? (
                    <span className="block text-warning-foreground">
                      {period.warnings.join(" ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
