<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class BillingWebhookEventSixData extends JsonSerializableType
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
     * @var value-of<BillingWebhookEventSixDataScope> $scope What the budget is for: a member's personal API keys (`user`), a project or an API key.
     */
    #[JsonProperty('scope')]
    public string $scope;

    /**
     * @var string $targetId The user, project or API key id.
     */
    #[JsonProperty('target_id')]
    public string $targetId;

    /**
     * @var int $percent The threshold crossed, e.g. 80.
     */
    #[JsonProperty('percent')]
    public int $percent;

    /**
     * @var int $amount The monthly budget, in cents.
     */
    #[JsonProperty('amount')]
    public int $amount;

    /**
     * @var int $spent Spent this month when it was crossed, in cents.
     */
    #[JsonProperty('spent')]
    public int $spent;

    /**
     * @var BillingWebhookEventSixDataPeriod $period
     */
    #[JsonProperty('period')]
    public BillingWebhookEventSixDataPeriod $period;

    /**
     * @param array{
     *   organizationId: string,
     *   occurredAt: DateTime,
     *   scope: value-of<BillingWebhookEventSixDataScope>,
     *   targetId: string,
     *   percent: int,
     *   amount: int,
     *   spent: int,
     *   period: BillingWebhookEventSixDataPeriod,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->organizationId = $values['organizationId'];
        $this->occurredAt = $values['occurredAt'];
        $this->scope = $values['scope'];
        $this->targetId = $values['targetId'];
        $this->percent = $values['percent'];
        $this->amount = $values['amount'];
        $this->spent = $values['spent'];
        $this->period = $values['period'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
