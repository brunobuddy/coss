<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * A cap on bookings in a day or a week.
 */
class SchedulingLimit extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingLimitPeriod> $period In the host's time zone.
     */
    #[JsonProperty('period')]
    public string $period;

    /**
     * @var int $max The most bookings allowed in one period.
     */
    #[JsonProperty('max')]
    public int $max;

    /**
     * @var ?value-of<SchedulingLimitScope> $scope Count this event type's bookings, or all of the host's.
     */
    #[JsonProperty('scope')]
    public ?string $scope;

    /**
     * @param array{
     *   period: value-of<SchedulingLimitPeriod>,
     *   max: int,
     *   scope?: ?value-of<SchedulingLimitScope>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->period = $values['period'];
        $this->max = $values['max'];
        $this->scope = $values['scope'] ?? null;
        if (array_key_exists('scope', $values)) {
            $this->_setField('scope');
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
