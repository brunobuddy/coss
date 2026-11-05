<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class Billing extends JsonSerializableType
{
    /**
     * @var value-of<BillingObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $organizationId The organization's id.
     */
    #[JsonProperty('organization_id')]
    public string $organizationId;

    /**
     * @var value-of<BillingPlan> $plan The plan in effect now (`free` without a contract).
     */
    #[JsonProperty('plan')]
    public string $plan;

    /**
     * @var ?BillingContract $contract The contract in effect; `null` on the Free plan.
     */
    #[JsonProperty('contract')]
    public ?BillingContract $contract;

    /**
     * @var ?BillingScheduledChange $scheduledChange A plan change that takes effect later (a downgrade, a cancellation).
     */
    #[JsonProperty('scheduled_change')]
    public ?BillingScheduledChange $scheduledChange;

    /**
     * @var value-of<BillingStatus> $status `past_due`: an invoice is overdue; `delinquent`: past its grace period, and live sending is held.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var array<BillingHoldsItem> $holds Billing holds on live sending (sandbox keys keep working).
     */
    #[JsonProperty('holds'), ArrayType([BillingHoldsItem::class])]
    public array $holds;

    /**
     * @var value-of<BillingCurrency> $currency Always `usd`.
     */
    #[JsonProperty('currency')]
    public string $currency;

    /**
     * @var BillingPeriod $period The current billing month (UTC).
     */
    #[JsonProperty('period')]
    public BillingPeriod $period;

    /**
     * @var array<BillingUsageItem> $usage This month's usage per meter.
     */
    #[JsonProperty('usage'), ArrayType([BillingUsageItem::class])]
    public array $usage;

    /**
     * @var BillingEstimate $estimate This month so far, as it would be invoiced if it ended now.
     */
    #[JsonProperty('estimate')]
    public BillingEstimate $estimate;

    /**
     * @var int $creditRemaining Unused credit usable this month.
     */
    #[JsonProperty('credit_remaining')]
    public int $creditRemaining;

    /**
     * @var ?int $spendLimit Usage beyond the credit past which live sending is held; `null`: none.
     */
    #[JsonProperty('spend_limit')]
    public ?int $spendLimit;

    /**
     * @var ?BillingCreditLimit $creditLimit Where the organization stands against its credit limit; `null`: it has none.
     */
    #[JsonProperty('credit_limit')]
    public ?BillingCreditLimit $creditLimit;

    /**
     * @var ?BillingPaymentMethod $paymentMethod The payment method on file. `null`: none.
     */
    #[JsonProperty('payment_method')]
    public ?BillingPaymentMethod $paymentMethod;

    /**
     * @var array<BillingAddOnsItem> $addOns Add-ons of the contract in effect, charged on top of the plan.
     */
    #[JsonProperty('add_ons'), ArrayType([BillingAddOnsItem::class])]
    public array $addOns;

    /**
     * @var BillingFeatures $features Which features the plan includes.
     */
    #[JsonProperty('features')]
    public BillingFeatures $features;

    /**
     * @var BillingLimits $limits Resource limits (`null`: unlimited).
     */
    #[JsonProperty('limits')]
    public BillingLimits $limits;

    /**
     * @param array{
     *   object: value-of<BillingObject>,
     *   organizationId: string,
     *   plan: value-of<BillingPlan>,
     *   status: value-of<BillingStatus>,
     *   holds: array<BillingHoldsItem>,
     *   currency: value-of<BillingCurrency>,
     *   period: BillingPeriod,
     *   usage: array<BillingUsageItem>,
     *   estimate: BillingEstimate,
     *   creditRemaining: int,
     *   addOns: array<BillingAddOnsItem>,
     *   features: BillingFeatures,
     *   limits: BillingLimits,
     *   contract?: ?BillingContract,
     *   scheduledChange?: ?BillingScheduledChange,
     *   spendLimit?: ?int,
     *   creditLimit?: ?BillingCreditLimit,
     *   paymentMethod?: ?BillingPaymentMethod,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->organizationId = $values['organizationId'];
        $this->plan = $values['plan'];
        $this->contract = $values['contract'] ?? null;
        if (array_key_exists('contract', $values)) {
            $this->_setField('contract');
        }
        $this->scheduledChange = $values['scheduledChange'] ?? null;
        if (array_key_exists('scheduledChange', $values)) {
            $this->_setField('scheduledChange');
        }
        $this->status = $values['status'];
        $this->holds = $values['holds'];
        $this->currency = $values['currency'];
        $this->period = $values['period'];
        $this->usage = $values['usage'];
        $this->estimate = $values['estimate'];
        $this->creditRemaining = $values['creditRemaining'];
        $this->spendLimit = $values['spendLimit'] ?? null;
        if (array_key_exists('spendLimit', $values)) {
            $this->_setField('spendLimit');
        }
        $this->creditLimit = $values['creditLimit'] ?? null;
        if (array_key_exists('creditLimit', $values)) {
            $this->_setField('creditLimit');
        }
        $this->paymentMethod = $values['paymentMethod'] ?? null;
        if (array_key_exists('paymentMethod', $values)) {
            $this->_setField('paymentMethod');
        }
        $this->addOns = $values['addOns'];
        $this->features = $values['features'];
        $this->limits = $values['limits'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
