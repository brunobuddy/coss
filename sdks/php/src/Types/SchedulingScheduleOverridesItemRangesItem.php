<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingScheduleOverridesItemRangesItem extends JsonSerializableType
{
    /**
     * @var string $start Local start time, `HH:MM`.
     */
    #[JsonProperty('start')]
    public string $start;

    /**
     * @var string $end Local end time, `HH:MM`. `24:00` is the end of the day.
     */
    #[JsonProperty('end')]
    public string $end;

    /**
     * @param array{
     *   start: string,
     *   end: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->start = $values['start'];
        $this->end = $values['end'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
