<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class BillingWebhookEventTwoData extends JsonSerializableType
{
    /**
     * @var string $organizationId The organization's id.
     */
    #[JsonProperty('organization_id')]
    public string $organizationId;

    /**
     * @var DateTime $occurredAt When it happened: sort events by it.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @var value-of<BillingWebhookEventTwoDataChange> $change `upgrade` (in effect now), `downgrade`/`cancellation` (scheduled), `reverted` (a scheduled change was undone), `contract` (a contract changed).
     */
    #[JsonProperty('change')]
    public string $change;

    /**
     * @var value-of<BillingWebhookEventTwoDataPlan> $plan The plan from `effective_at`.
     */
    #[JsonProperty('plan')]
    public string $plan;

    /**
     * @var value-of<BillingWebhookEventTwoDataPreviousPlan> $previousPlan
     */
    #[JsonProperty('previous_plan')]
    public string $previousPlan;

    /**
     * @var DateTime $effectiveAt
     */
    #[JsonProperty('effective_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $effectiveAt;

    /**
     * @param array{
     *   organizationId: string,
     *   occurredAt: DateTime,
     *   change: value-of<BillingWebhookEventTwoDataChange>,
     *   plan: value-of<BillingWebhookEventTwoDataPlan>,
     *   previousPlan: value-of<BillingWebhookEventTwoDataPreviousPlan>,
     *   effectiveAt: DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->organizationId = $values['organizationId'];
        $this->occurredAt = $values['occurredAt'];
        $this->change = $values['change'];
        $this->plan = $values['plan'];
        $this->previousPlan = $values['previousPlan'];
        $this->effectiveAt = $values['effectiveAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
