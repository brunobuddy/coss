<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

/**
 * Its own sending standing.
 */
class SubaccountReputation extends JsonSerializableType
{
    /**
     * @var value-of<SubaccountReputationStatus> $status `warning`: a rate is close to its limit. `paused`: its live sends are refused (`subaccount_paused`) until you reinstate it.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var ?string $trigger What last changed it, e.g. `bounce_rate`, `complaint_rate`, `content_screening`.
     */
    #[JsonProperty('trigger')]
    public ?string $trigger;

    /**
     * @var ?DateTime $changedAt When its status last changed. `null`: never.
     */
    #[JsonProperty('changed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $changedAt;

    /**
     * @var ?DateTime $reinstatedAt When it was last reinstated. `null`: never.
     */
    #[JsonProperty('reinstated_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $reinstatedAt;

    /**
     * @param array{
     *   status: value-of<SubaccountReputationStatus>,
     *   trigger?: ?string,
     *   changedAt?: ?DateTime,
     *   reinstatedAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->status = $values['status'];
        $this->trigger = $values['trigger'] ?? null;
        if (array_key_exists('trigger', $values)) {
            $this->_setField('trigger');
        }
        $this->changedAt = $values['changedAt'] ?? null;
        if (array_key_exists('changedAt', $values)) {
            $this->_setField('changedAt');
        }
        $this->reinstatedAt = $values['reinstatedAt'] ?? null;
        if (array_key_exists('reinstatedAt', $values)) {
            $this->_setField('reinstatedAt');
        }
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
