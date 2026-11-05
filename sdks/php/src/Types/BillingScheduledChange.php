<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use DateTime;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\Date;

/**
 * A plan change that takes effect later (a downgrade, a cancellation).
 */
class BillingScheduledChange extends JsonSerializableType
{
    /**
     * @var DateTime $effectiveAt When it takes effect.
     */
    #[JsonProperty('effective_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $effectiveAt;

    /**
     * @var value-of<BillingScheduledChangePlan> $plan The plan it changes to.
     */
    #[JsonProperty('plan')]
    public string $plan;

    /**
     * @param array{
     *   effectiveAt: DateTime,
     *   plan: value-of<BillingScheduledChangePlan>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->effectiveAt = $values['effectiveAt'];
        $this->plan = $values['plan'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
