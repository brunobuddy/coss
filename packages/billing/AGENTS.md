# packages/billing — plans, contracts, metering, invoices

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

- **Billing** (`packages/billing`; tables `billing_*`, ids `bacct_`, `bcon_`, `bcg_`, `bce_`, `bper_`, `inv_`, `invl_`,
  `bpay_`, `bcn_`, `bpev_`, `bntf_`): coss.com owns the catalog, contracts, metering, rating, credits, invoices and
  dunning; a `BillingProvider` (per `billing_account.provider`: `fake`, `stripe` or `manual` for off-Stripe deals) only
  keeps customers and payment methods, issues the invoices coss.com pushes (numbered by coss.com, `auto_advance: false`) and
  collects them. Never move pricing into Stripe objects (prices, subscriptions, meters).
  - **Catalog** (`./catalog`, client-safe, reviewed like code): `METERS`, dated `RATE_CARDS` (a price change is a new
    card; periods before it keep the old prices), `PLANS` (Free/Pro/Scale/Enterprise: fee = spendable usage credit,
    included units, `overage: blocked | billed`, entitlements incl. plan rate limits), `ADD_ONS` (catalog add-ons: price, interval,
    the `plans` they're offered on and the `features` they grant while a contract in effect lists their key —
    `resolveTerms` adds them; custom contract add-ons grant nothing; today only `dedicated_ips`).
    The docs' `/docs/billing` (`<PlanTable />`, `<UsageRates />`, `<AddOns />`) and the dashboard render it.
  - **Contracts** (`billing_contract`, `terms` jsonb = `ContractTerms` v1, zod, bigints as strings): a confirmed
    contract is in effect while `effective_from <= t < effective_until`; **time decides, never a loop**; none in effect
    = Free (no rows). Every change takes `lockBillingAccount` first, which keeps contracts from overlapping. Self-serve
    contracts store only `{ version: 1, plan, addOns? }` (catalog add-ons, priced when bought); sales contracts pin what they override (fee, rates/tiers, discounts,
    commitments, add-ons, entitlements, caps). A future contract starts on the 1st of a month (UTC); one starting now
    (or backdated within the open month) is invoiced for the rest of it at once. Self-serve plan changes are refused on
    `sales`/`internal` contracts and while one is scheduled (`scheduledManagedContract`); a self-serve contract never
    cancels a scheduled managed one (`supersedeAt` ends it where that one starts).
  - **Self-serve add-ons** (`startAddOn`, `scheduleAddOnRemoval` in `changes.ts`): adding one is a pending successor
    contract (same plan, plus the add-on) whose invoice charges only the add-on for the rest of the month
    (`composeContractChange` carries an unchanged monthly fee and same-price add-ons instead of re-charging and
    crediting them, so later changes in the month and the month close follow `supersedes_id` back to where
    they were charged — `carried.ts`; a replaced contract's unused in-advance add-on time is credited at its
    discounted price, `unused-addon:` keys), confirmed
    once paid like an upgrade; refused off its `plans`, while any change is scheduled, or by the caller's
    `AddOnPreflight` (run in the purchase's transaction; the dashboard's Dedicated IPs capacity check). Removal is a successor without it at the next
    month (`cancelScheduledChange` undoes it). Upgrades and downgrades carry add-ons over; a downgrade to a plan an
    add-on isn't offered on is refused until it is removed. `validateContract` refuses catalog add-ons off their
    plans for every contract kind. `organizationsEntitledTo(feature)` lists organizations whose contract in effect
    grants a feature (the worker's reconciliation).
  - **Money**: unit prices are bigint **nanos**, every stored amount bigint **cents**; a line is rounded once
    (half away from zero) and an invoice's total is the sum of its lines. USD only (`currency` column).
  - **Metering** (`billing_usage`, hourly counters by org/environment/meter/dimension, 8 shards, no FK to the
    environment): products call `recordUsage(tx, …)` in the transaction that makes usage billable; the hour is the
    transaction's (`date_trunc('hour', transaction_timestamp(), 'UTC')`), so a month is closed only after
    `USAGE_SETTLE_MS`. Email is metered at `sent` (all four paths: `complete`, both `recordProviderEvent` transitions,
    `sweepStaleClaims`) for its `billable_recipients` (non-suppressed, frozen at claim), once
    (`usage_recorded_at` compare-and-set), and on `email.dedicated_ip` too when it went through the organization's
    dedicated IPs (`email.dedicated_pool`); sandbox never. Received email is `email.received` when it is stored
    (sandbox too: it is real mail; not the fake provider's, spam or viruses), inboxes `email.inboxes` per day a live
    one exists (priced per 30 inbox-days; see `packages/email/AGENTS.md`). Hooks is `hooks.messages`, one per live
    message accepted whatever its fan-out, with Free capped and paid plans including more (`packages/hooks/AGENTS.md`).
    Risk is `risk.assessments` and `risk.content_checks`; at Free's allowance assessments run reduced instead of
    stopping (`packages/risk/AGENTS.md`).
  - **Attribution and spend** (`billing_usage_attribution`, `./spend`): `recordUsage` also writes who caused the usage
    (project, API key, and the member a personal key belongs to — `email.api_key_owner_id`, captured at
    acceptance, so revoking a key never erases a member's spend), same hour and shard as `billing_usage`, which
    stays the only rating input (a separate table: changing `billing_usage`'s key would break older tasks'
    upserts mid-rollout). `spendBreakdown` splits the running month's usage charges (usage lines, net of meter
    discounts and write-offs; credits pay for spend, they don't reduce it) by each source's share of every meter's
    quantity (`allocateUsageCharges`, largest remainder, so the parts add up to the invoice's usage lines); usage
    without attribution (older rows) stays with its environment, keyless. `GET /v1/billing/usage`
    `group_by=project|api_key|user` reads it too.
  - **Budgets** (`billing_budget`, ids `bbud_`; `billing_budget_hold`, presence = paused; `./budgets`): monthly
    budgets of spend for members (a `member_default`, overridden per member — no amount exempts them), projects
    and API keys; changed only by owners (`billing:update`). The worker's `billing-usage` loop
    (`checkOrganizationSpend`, also run by the dashboard right after a change, so a raised budget lifts at once)
    alerts at each budget's thresholds (`budget_threshold`, `billing.budget_threshold_reached`) and over budget
    places a hold (`budget_paused` notification, which also goes to the member it concerns —
    `billing_notification.user_id` —, push `billing_budget_paused`, `billing.budget_hold_placed`); it is lifted
    under budget, without one, or in a new month (organizations with holds stay candidates). A hold refuses its
    source's live sends at acceptance (`EmailError("budget_exceeded")`, 402, via `budgetHoldFor` in
    `./metering`), holds its scheduled sends (`budgetHoldExists`) and pauses its broadcasts (self-healing);
    already-queued immediate sends go out. A project's hold covers dashboard sends in it too. Independent of
    billing holds and the organization's spend limit.
  - **Rating** (`./engine`, pure, most tests): graduated or volume tiers carried across the month's contract segments
    (or the term, `tierWindow: term`); included units and unit grants take the period's first positions (Free's
    allowance per period, never prorated); dollar grants drawn down most specific scope first, then soonest expiry;
    capped plans never charge usage (`write_off`); minimum-spend shortfalls at their period's end; fees and add-ons in
    advance or arrears; each month's fee becomes its credit grant. Charges and grants are idempotent across invoices by
    `charge_key` / `grant_key` (voiding an invoice clears its keys, reverses its credit entries and voids grants it
    funded).
  - **Month close** (`runDueBillingPeriods`, worker `billing-periods`): one invoice per account and month
    (`billing_period` makes it idempotent) with the month's arrears and the next month's advance charges; only accounts
    with a contract around it. Upgrades take effect once their prorated invoice is paid (`pending` contract, grants
    deferred in `terms_snapshot.pendingGrants`, expired after a day); downgrades and cancellations at the month's end,
    refused while the org uses something the lower plan lacks (the dashboard's preflight), and creation meanwhile is
    checked against both plans (`creatableEntitlements`). Auto-renewing contracts get a successor a week before
    their term ends (note `renewalNote(id)`; ending the contract cancels it if it hasn't started); non-renewing ones
    end with their term.
  - **Collection**: `billing-sync` pushes and collects (charge, or send with net terms). A charge is never attempted
    without a payment method (`no_payment_method`): a pending upgrade's invoice waits for one (its customer is in
    Checkout; returning collects at once through `collectInvoiceNow`, which also retries a failed or 3-D Secure
    charge), anything else is dunned as `No payment method on file.`. Stripe's invalid-request refusals are read
    back (an invoice already paid on the hosted page is recorded as paid). Stripe carries invoices below its minimum
    charge to the next one (customer balance); every paid amount coss.com reads leaves that debit out
    (`paidTowardInvoice`). `billing-collection` retries failed charges (+3/+5/+7 days), reminds about net-terms
    invoices, sets `past_due`, and after `grace_days` (and, for an automatic charge, once no retry or charge is left
    to come) places a `delinquent` **billing hold** (`billing_hold`, presence = held). A hold makes
    `authorizeLiveSender` refuse
    (`EmailError("billing_hold")`, 402) and holds scheduled sends (`organizationActive`) — never fails them; paying lifts
    it. Holds are independent of reputation suspensions: never fold one into the other. Spend limits place a
    `spend_limit` hold (worker `billing-usage`), lifted by the next month or a higher limit. coss.com's own organization is
    never held or capped (`systemOrganizationId`).
  - **Provider events**: the dashboard's `/api/billing/webhook` (public) verifies Stripe's signature and only stores the
    event (`billing_provider_event`); the worker's `billing-events` loop re-reads each object from Stripe and moves
    states forward only (`paid` is final). `billing-reconcile` re-checks quiet open invoices hourly.
  - **Enforcement is injected**: `PlanGate` (`DomainDeps.plans`, `WebhookManagementDeps.plans`, the API's `plans`
    option → `requirePlanFeature`), `UsageGate` (`EmailServiceOptions.billing`: Free's cap, reserved in the send's
    transaction against `billing_quota`, refused as `BillingError("usage_limit_exceeded")`), plan rate limits
    (`createRateLimitRuntime({ planRules })`: default < plan < admin override), the member limit
    (`setMembershipLimitResolver`). Packages and test helpers default to unenforced; the apps wire the real ones.
    Errors: `BillingError` (402 codes → API `billing_error`, never retried by the SDK).
  - **Admin changes** (contracts, credits, invoice voids/payments/credit notes/one-off invoices, account settings,
    holds) write `admin_audit_event` in their transaction (`auditBillingChange`; `billing.*` in `ADMIN_ACTIONS`).
  - **Public API and events** (`apps/api/src/routes/billing.ts`, read models in `src/api.ts`, wire schemas in
    `./wire`): `GET /v1/billing`, `/v1/billing/usage` (≤ 400 days, 7 by hour), `/v1/billing/invoices[/{id}]`
    (finalized only; drafts are never exposed) and `/v1/billing/credits`, read-only with `billing:read` from any
    environment's key (`coss.billing`). Changes stay in the dashboard. `billing.*` events (`BILLING_EVENT_TYPES`, part
    of `WEBHOOK_EVENT_TYPES`) go through `announce(tx, organizationId, …)` to every **live** environment's endpoints, in
    the transaction that decided them: invoice finalized/paid/payment failed/voided, plan changed (also when scheduled
    or undone), usage threshold, hold placed/lifted, credit granted. Emit them only when the change actually applied
    (`placeHold`/`liftHold`/`enqueueBillingNotification` return whether they did). Payloads carry invoice summaries
    (no lines) and customer-facing credit fields — never internal reasons, notes or admin identities.
  - **Invoices outlive the organization** (no FK, names copied, `RETENTION_DAYS.invoices`); deleting an organization
    issues one `final` invoice for the running month (`finalizeOrganizationBilling`, in `releaseProviderResources`)
    and leaves the Stripe customer so it can still be collected; owners can't request deletion with open invoices.
