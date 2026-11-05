<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingScheduleRulesItem extends JsonSerializableType
{
    /**
     * @var array<float> $days Weekdays, with Sunday as 0.
     */
    #[JsonProperty('days'), ArrayType(['float'])]
    public array $days;

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
     *   days: array<float>,
     *   start: string,
     *   end: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->days = $values['days'];
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
