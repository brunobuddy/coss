import { describe, expect, spyOn, test } from "bun:test";
import type { BillingAccount } from "../src/accounts.ts";
import type { InvoiceLineRow, InvoiceRow } from "../src/invoices.ts";
import { StripeBillingProvider } from "../src/providers/stripe.ts";
import { FakeStripeApi } from "../src/testing.ts";

function account(overrides: Partial<BillingAccount> = {}): BillingAccount {
  return {
    id: "bacct_1",
    organizationId: "org_1",
    provider: "stripe",
    providerCustomerId: null,
    collectionMethod: "charge_automatically",
    netTermsDays: 30,
    allowedPaymentMethods: ["card", "us_bank_account"],
    requiredPaymentMethods: [],
    taxMode: "none",
    billingEmail: "billing@acme.test",
    billingCc: [],
    billingName: null,
    billingAddress: null,
    taxId: null,
    spendLimitCents: null,
    creditLimitCents: null,
    alertThresholds: [80, 100],
    graceDays: 14,
    status: "active",
    pastDueSince: null,
    holdExemptUntil: null,
    paymentMethod: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function invoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: "inv_1",
    organizationId: "org_1",
    accountId: "bacct_1",
    organizationName: "Acme",
    organizationSlug: "acme",
    number: "COSS-000042",
    kind: "period",
    status: "open",
    currency: "usd",
    periodStart: new Date("2026-10-01T00:00:00Z"),
    periodEnd: new Date("2026-11-01T00:00:00Z"),
    subtotalCents: 72_500n,
    discountCents: 0n,
    creditCents: 2_500n,
    taxCents: 0n,
    totalCents: 70_000n,
    amountPaidCents: 0n,
    amountDueCents: 70_000n,
    collectionMethod: "charge_automatically",
    provider: "stripe",
    providerCustomerId: null,
    providerInvoiceId: null,
    hostedUrl: null,
    pdfUrl: null,
    billingEmail: null,
    dueAt: new Date(),
    finalizedAt: new Date(),
    paidAt: null,
    voidedAt: null,
    syncAction: "push",
    syncAttempts: 1,
    nextSyncAt: null,
    syncError: null,
    collectionAttempts: 0,
    nextCollectionAt: null,
    paymentState: null,
    paymentError: null,
    termsSnapshot: null,
    memo: null,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function line(id: string, amountCents: bigint, description: string): InvoiceLineRow {
  return {
    id,
    invoiceId: "inv_1",
    organizationId: "org_1",
    position: 0,
    kind: "usage",
    description,
    meter: null,
    dimension: null,
    quantity: null,
    coveredUnits: null,
    unitNanos: null,
    amountCents,
    periodStart: new Date("2026-10-01T00:00:00Z"),
    periodEnd: new Date("2026-11-01T00:00:00Z"),
    contractId: null,
    grantId: null,
    chargeKey: null,
    detail: null,
  };
}

function setup() {
  const api = new FakeStripeApi();
  const stripe = new StripeBillingProvider({ secretKey: "sk_test_fake", fetch: api.fetch });
  return { api, stripe };
}

describe("StripeBillingProvider", () => {
  test("pushes an invoice: customer, numbered draft, one item per line, finalized without auto-advance", async () => {
    const { api, stripe } = setup();
    const customerId = await stripe.ensureCustomer(account(), {
      id: "org_1",
      name: "Acme",
      slug: "acme",
    });
    const lines = [
      line("invl_1", 70_000n, "Email: 2,000,000 recipients"),
      line("invl_2", 2_500n, "Pro plan"),
      line("invl_3", -2_500n, "Credit applied"),
      line("invl_4", 0n, "Free units"),
    ];
    const pushed = await stripe.pushInvoice({
      invoice: invoice({ providerCustomerId: customerId }),
      lines,
      account: account({ providerCustomerId: customerId }),
    });
    expect(pushed).toMatchObject({
      totalCents: 70_000n,
      taxCents: 0n,
      hostedUrl: expect.stringContaining("https://invoice.stripe.test/"),
    });
    const created = api.invoices.get(pushed.providerInvoiceId ?? "");
    expect(created).toMatchObject({
      number: "COSS-000042",
      auto_advance: false,
      status: "open",
      metadata: { coss_invoice_id: "inv_1" },
    });
    const items = api.requests.filter((request) => request.path === "/v1/invoiceitems");
    expect(items.map((request) => [request.params.amount, request.idempotencyKey])).toEqual([
      ["70000", "coss:invoice:inv_1:line:invl_1"],
      ["2500", "coss:invoice:inv_1:line:invl_2"],
      ["-2500", "coss:invoice:inv_1:line:invl_3"],
    ]);
    // A retry after a crash replays the same requests (idempotency keys) instead of duplicating.
    const again = await stripe.pushInvoice({
      invoice: invoice({
        providerCustomerId: customerId,
        providerInvoiceId: pushed.providerInvoiceId,
      }),
      lines,
      account: account({ providerCustomerId: customerId }),
    });
    expect(again.providerInvoiceId).toBe(pushed.providerInvoiceId);
    expect(api.invoices.size).toBe(1);
  });

  test("collects: paid, declined, needs authentication, still processing", async () => {
    const { api, stripe } = setup();
    const customerId = await stripe.ensureCustomer(account(), {
      id: "org_1",
      name: "Acme",
      slug: "acme",
    });
    // Stripe charges only a customer with a default payment method.
    api.attachPaymentMethod(customerId);
    const pushed = await stripe.pushInvoice({
      invoice: invoice({ providerCustomerId: customerId }),
      lines: [line("invl_1", 1_000n, "Usage")],
      account: null,
    });
    const target = invoice({
      providerCustomerId: customerId,
      providerInvoiceId: pushed.providerInvoiceId,
    });
    api.payOutcomes.push("declined", "authentication_required", "processing");
    expect(await stripe.collect({ invoice: target, lines: [], account: null })).toEqual({
      state: "failed",
      error: "Your card was declined.",
    });
    expect(
      await stripe.collect({
        invoice: { ...target, collectionAttempts: 1 },
        lines: [],
        account: null,
      }),
    ).toMatchObject({
      state: "requires_action",
      hostedUrl: expect.stringContaining("https://invoice.stripe.test/"),
    });
    expect(
      await stripe.collect({
        invoice: { ...target, collectionAttempts: 2 },
        lines: [],
        account: null,
      }),
    ).toEqual({
      state: "processing",
    });
    expect(
      await stripe.collect({
        invoice: { ...target, collectionAttempts: 3 },
        lines: [],
        account: null,
      }),
    ).toMatchObject({
      state: "paid",
      amountCents: 1_000n,
      paymentId: `pi_for_${pushed.providerInvoiceId}`,
    });
    const keys = api.requests
      .filter((request) => request.path.endsWith("/pay"))
      .map((request) => request.idempotencyKey);
    expect(new Set(keys).size).toBe(4);
  });

  test("invoices with net terms are sent, not charged", async () => {
    const { api, stripe } = setup();
    const customerId = await stripe.ensureCustomer(account(), {
      id: "org_1",
      name: "Acme",
      slug: "acme",
    });
    const target = invoice({ providerCustomerId: customerId, collectionMethod: "send_invoice" });
    const pushed = await stripe.pushInvoice({
      invoice: target,
      lines: [line("invl_1", 1_000n, "Fee")],
      account: null,
    });
    expect(
      api.requests.find((request) => request.path === "/v1/invoices")?.params.collection_method,
    ).toBe("send_invoice");
    const result = await stripe.collect({
      invoice: { ...target, providerInvoiceId: pushed.providerInvoiceId },
      lines: [],
      account: null,
    });
    expect(result).toEqual({ state: "sent" });
  });

  test("a setup session makes the new card the default", async () => {
    const { api, stripe } = setup();
    const customerId = await stripe.ensureCustomer(account(), {
      id: "org_1",
      name: "Acme",
      slug: "acme",
    });
    const withCustomer = account({ providerCustomerId: customerId });
    const session = await stripe.createSetupSession(
      withCustomer,
      { id: "org_1", name: "Acme", slug: "acme" },
      {
        returnUrl: "https://coss.test/acme/settings/billing",
        cancelUrl: "https://coss.test/acme/settings/billing",
        methods: ["card", "us_bank_account", "customer_balance"],
      },
    );
    expect(session.url).toContain("https://checkout.stripe.test/");
    const created = api.requests.find((request) => request.path === "/v1/checkout/sessions");
    expect(created?.params).toMatchObject({
      mode: "setup",
      "payment_method_types[0]": "card",
      "payment_method_types[1]": "us_bank_account",
    });
    expect(created?.params.success_url).toContain("setup={CHECKOUT_SESSION_ID}");
    // Someone else's session (another customer) is refused.
    expect(
      await stripe.completeSetup(account({ providerCustomerId: "cus_other" }), session.sessionId),
    ).toBeNull();
    api.completeSession(session.sessionId);
    expect(await stripe.completeSetup(withCustomer, session.sessionId)).toEqual({
      type: "card",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
    });
    expect(await stripe.paymentMethod(withCustomer)).toMatchObject({ last4: "4242" });
  });

  test("events are read from the invoice's current state", async () => {
    const { api, stripe } = setup();
    const customerId = await stripe.ensureCustomer(account(), {
      id: "org_1",
      name: "Acme",
      slug: "acme",
    });
    // Stripe charges only a customer with a default payment method.
    api.attachPaymentMethod(customerId);
    const pushed = await stripe.pushInvoice({
      invoice: invoice({ providerCustomerId: customerId }),
      lines: [line("invl_1", 1_000n, "Usage")],
      account: null,
    });
    const event = (type: string) => ({
      id: `evt_${type}`,
      type,
      payload: { data: { object: { id: pushed.providerInvoiceId, object: "invoice" } } },
    });
    // A stale `payment_failed` for an invoice that is open.
    expect(await stripe.interpretEvent(event("invoice.payment_failed"))).toEqual([
      {
        kind: "invoice_payment_failed",
        providerInvoiceId: pushed.providerInvoiceId ?? "",
        error: "The payment failed.",
      },
    ]);
    await stripe.collect({
      invoice: invoice({ providerInvoiceId: pushed.providerInvoiceId }),
      lines: [],
      account: null,
    });
    // Once paid, any invoice event reports it paid.
    expect(await stripe.interpretEvent(event("invoice.payment_failed"))).toMatchObject([
      { kind: "invoice_paid", amountCents: 1_000n },
    ]);
    expect(
      await stripe.interpretEvent({ id: "evt_x", type: "product.created", payload: {} }),
    ).toEqual([]);
  });
});

describe("credit notes", () => {
  test("on a paid invoice, what isn't refunded is out of band (coss.com keeps it as credit)", async () => {
    const { api, stripe } = setup();
    const customerId = await stripe.ensureCustomer(account(), {
      id: "org_1",
      name: "Acme",
      slug: "acme",
    });
    // Stripe charges only a customer with a default payment method.
    api.attachPaymentMethod(customerId);
    const pushed = await stripe.pushInvoice({
      invoice: invoice({ providerCustomerId: customerId }),
      lines: [line("invl_1", 10_000n, "Usage")],
      account: null,
    });
    const target = invoice({
      providerCustomerId: customerId,
      providerInvoiceId: pushed.providerInvoiceId,
    });
    await stripe.collect({ invoice: target, lines: [], account: null });
    await stripe.createCreditNote(
      { invoice: target, lines: [], account: null },
      { id: "bcn_1", amountCents: 4_000n, refundCents: 1_000n, memo: "Correction" },
    );
    const request = api.requests.find(
      (entry) => entry.path === "/v1/credit_notes" && entry.method === "POST",
    );
    expect(request?.params).toMatchObject({
      amount: "4000",
      refund_amount: "1000",
      out_of_band_amount: "3000",
    });
  });
});

test("existing Stripe customers receive the saved contact before invoice creation and sending", async () => {
  const { api, stripe } = setup();
  const organization = { id: "org_1", name: "Acme", slug: "acme" };
  const customerId = await stripe.ensureCustomer(account({ billingEmail: null }), organization);
  const saved = account({
    providerCustomerId: customerId,
    billingEmail: "new@acme.test",
    billingName: "Acme Billing",
  });
  expect(await stripe.ensureCustomer(saved, organization)).toBe(customerId);
  expect(api.customers.get(customerId)).toMatchObject({
    email: "new@acme.test",
    name: "Acme Billing",
  });
  const target = invoice({ providerCustomerId: customerId, collectionMethod: "send_invoice" });
  const pushed = await stripe.pushInvoice({
    invoice: target,
    lines: [line("invl_1", 1000n, "Fee")],
    account: saved,
  });
  await stripe.collect({
    invoice: { ...target, providerInvoiceId: pushed.providerInvoiceId },
    lines: [],
    account: { ...saved, billingEmail: "latest@acme.test" },
  });
  expect(api.customers.get(customerId)?.email).toBe("latest@acme.test");
  const send = api.requests.findIndex((request) => request.path.endsWith("/send"));
  expect(api.requests[send - 1]?.params.email).toBe("latest@acme.test");
  // Without a billing email of coss.com's, Stripe keeps the customer's own (set in the Customer
  // Portal): coss.com never wipes it.
  const customer = api.customers.get(customerId);
  if (customer) customer.email = "portal@acme.test";
  await stripe.ensureCustomer({ ...saved, billingEmail: null }, organization);
  await stripe.pushInvoice({
    invoice: invoice({ id: "inv_2", providerCustomerId: customerId }),
    lines: [line("invl_2", 1000n, "Fee")],
    account: { ...saved, billingEmail: null },
  });
  expect(api.customers.get(customerId)?.email).toBe("portal@acme.test");
  expect(
    api.requests.some(
      (request) => request.path === `/v1/customers/${customerId}` && request.params.email === "",
    ),
  ).toBe(false);
  expect(api.customers.size).toBe(1);
});

test("an invoice below Stripe's minimum charge doesn't count as an overpayment of the next", async () => {
  const { api, stripe } = setup();
  const organization = { id: "org_1", name: "Acme", slug: "acme" };
  const customerId = await stripe.ensureCustomer(account(), organization);
  api.attachPaymentMethod(customerId);
  const saved = account({ providerCustomerId: customerId });

  // 30¢ (a proration in the last hour of a month): Stripe marks it paid without charging and
  // adds it to the customer's next invoice.
  const small = invoice({ id: "inv_small", providerCustomerId: customerId });
  const pushedSmall = await stripe.pushInvoice({
    invoice: small,
    lines: [line("invl_small", 30n, "Proration")],
    account: saved,
  });
  const smallTarget = { ...small, providerInvoiceId: pushedSmall.providerInvoiceId };
  expect(await stripe.collect({ invoice: smallTarget, lines: [], account: saved })).toMatchObject({
    state: "paid",
    amountCents: 0n,
  });
  expect(api.customers.get(customerId)?.balance).toBe(30);

  // The next invoice is charged $25.30, of which $25.00 is its own.
  const next = invoice({ id: "inv_next", providerCustomerId: customerId });
  const pushedNext = await stripe.pushInvoice({
    invoice: next,
    lines: [line("invl_next", 2_500n, "Pro")],
    account: saved,
  });
  const nextTarget = { ...next, providerInvoiceId: pushedNext.providerInvoiceId };
  expect(await stripe.collect({ invoice: nextTarget, lines: [], account: saved })).toMatchObject({
    state: "paid",
    amountCents: 2_500n,
  });
  expect(api.invoices.get(pushedNext.providerInvoiceId ?? "")?.amount_paid).toBe(2_530);
  expect(
    (await stripe.fetchInvoice({ invoice: nextTarget, lines: [], account: saved }))?.paidCents,
  ).toBe(2_500n);
  const outcomes = await stripe.interpretEvent({
    id: "evt_paid",
    type: "invoice.paid",
    payload: { data: { object: { id: pushedNext.providerInvoiceId } } },
  });
  expect(outcomes).toMatchObject([{ kind: "invoice_paid", amountCents: 2_500n }]);
});

test("an invoice paid on the hosted page, read back on a retry, leaves a carried debit out", async () => {
  const { api, stripe } = setup();
  const organization = { id: "org_1", name: "Acme", slug: "acme" };
  const customerId = await stripe.ensureCustomer(account(), organization);
  api.attachPaymentMethod(customerId);
  const saved = account({ providerCustomerId: customerId });
  const customer = api.customers.get(customerId);
  if (customer) customer.balance = 30; // An earlier invoice below the minimum charge.
  const target = invoice({ id: "inv_hosted", providerCustomerId: customerId });
  const pushed = await stripe.pushInvoice({
    invoice: target,
    lines: [line("invl_hosted", 2_500n, "Pro")],
    account: saved,
  });
  // The customer pays $25.30 on the hosted page before coss.com's retry.
  const stripeInvoice = api.invoices.get(pushed.providerInvoiceId ?? "");
  if (stripeInvoice)
    Object.assign(stripeInvoice, { status: "paid", amount_paid: 2_530, amount_due: 0 });
  expect(
    await stripe.collect({
      invoice: { ...target, providerInvoiceId: pushed.providerInvoiceId },
      lines: [],
      account: saved,
    }),
  ).toMatchObject({ state: "paid", amountCents: 2_500n });
});

test("a fully credited invoice retries safely after losing the provider response", async () => {
  const api = new FakeStripeApi();
  let loseResponse = false;
  const stripe = new StripeBillingProvider({
    secretKey: "sk_test_fake",
    fetch: async (input, init) => {
      const response = await api.fetch(input, init);
      if (loseResponse && String(input).endsWith("/v1/credit_notes") && init?.method === "POST") {
        throw new Error("Lost response after creating credit note");
      }
      return response;
    },
  });
  const customer = await stripe.ensureCustomer(account(), {
    id: "org_1",
    name: "Acme",
    slug: "acme",
  });
  const pushed = await stripe.pushInvoice({
    invoice: invoice({ providerCustomerId: customer }),
    lines: [line("invl_1", 1000n, "Service")],
    account: null,
  });
  const input = {
    invoice: invoice({ providerInvoiceId: pushed.providerInvoiceId }),
    lines: [],
    account: null,
  };
  const note = { id: "bcn_lost", amountCents: 1000n, refundCents: 0n, memo: "Correction" };
  loseResponse = true;
  await expect(stripe.createCreditNote(input, note)).rejects.toThrow();
  loseResponse = false;
  const recovered = await stripe.createCreditNote(input, note);
  expect(recovered.providerCreditNoteId).toBe([...api.creditNotes.keys()][0] ?? null);
  expect(api.creditNotes.size).toBe(1);
});

test("a delayed invoice push retries with the original net terms", async () => {
  const { api, stripe } = setup();
  const customer = await stripe.ensureCustomer(account(), {
    id: "org_1",
    name: "Acme",
    slug: "acme",
  });
  const finalizedAt = new Date();
  const input = {
    invoice: invoice({
      providerCustomerId: customer,
      collectionMethod: "send_invoice",
      finalizedAt,
      dueAt: new Date(finalizedAt.getTime() + 30 * 86400000),
    }),
    lines: [line("invl_1", 1000n, "Fee")],
    account: account(),
  };
  const pushed = await stripe.pushInvoice(input);
  const clock = spyOn(Date, "now").mockReturnValue(finalizedAt.getTime() + 86400000);
  try {
    expect((await stripe.pushInvoice(input)).providerInvoiceId).toBe(pushed.providerInvoiceId);
    expect(api.invoices.size).toBe(1);
    const creates = api.requests.filter(
      (request) => request.method === "POST" && request.path === "/v1/invoices",
    );
    expect(creates.map((request) => request.params.due_date)).toEqual([
      String(Math.floor((finalizedAt.getTime() + 30 * 86400000) / 1000)),
      String(Math.floor((finalizedAt.getTime() + 30 * 86400000) / 1000)),
    ]);
  } finally {
    clock.mockRestore();
  }
});
