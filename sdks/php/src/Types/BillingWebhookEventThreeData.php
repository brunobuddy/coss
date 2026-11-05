<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class BillingWebhookEventThreeData extends JsonSerializableType
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
     * @var int $percent The threshold crossed, e.g. 80.
     */
    #[JsonProperty('percent')]
    public int $percent;

    /**
     * @var value-of<BillingWebhookEventThreeDataOf> $of `credit`: the month's usage credit; `allowance`: a capped plan's included units.
     */
    #[JsonProperty('of')]
    public string $of;

    /**
     * @var ?value-of<BillingWebhookEventThreeDataMeter> $meter The allowance's meter (`of: allowance`).
     */
    #[JsonProperty('meter')]
    public ?string $meter;

    /**
     * @var BillingWebhookEventThreeDataPeriod $period
     */
    #[JsonProperty('period')]
    public BillingWebhookEventThreeDataPeriod $period;

    /**
     * @param array{
     *   organizationId: string,
     *   occurredAt: DateTime,
     *   percent: int,
     *   of: value-of<BillingWebhookEventThreeDataOf>,
     *   period: BillingWebhookEventThreeDataPeriod,
     *   meter?: ?value-of<BillingWebhookEventThreeDataMeter>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->organizationId = $values['organizationId'];
        $this->occurredAt = $values['occurredAt'];
        $this->percent = $values['percent'];
        $this->of = $values['of'];
        $this->meter = $values['meter'] ?? null;
        if (array_key_exists('meter', $values)) {
            $this->_setField('meter');
        }
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
