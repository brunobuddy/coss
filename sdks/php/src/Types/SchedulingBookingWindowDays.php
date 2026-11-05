<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingBookingWindowDays extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingBookingWindowDaysKind> $kind
     */
    #[JsonProperty('kind')]
    public string $kind;

    /**
     * @var int $days Days ahead of now that slots are offered.
     */
    #[JsonProperty('days')]
    public int $days;

    /**
     * @param array{
     *   kind: value-of<SchedulingBookingWindowDaysKind>,
     *   days: int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->kind = $values['kind'];
        $this->days = $values['days'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
