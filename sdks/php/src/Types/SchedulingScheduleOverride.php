<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingScheduleOverride extends JsonSerializableType
{
    /**
     * @var string $date A local date in the schedule's time zone.
     */
    #[JsonProperty('date')]
    public string $date;

    /**
     * @var array<SchedulingScheduleOverrideRangesItem> $ranges Replaces the weekly rules that day. Empty means unavailable all day.
     */
    #[JsonProperty('ranges'), ArrayType([SchedulingScheduleOverrideRangesItem::class])]
    public array $ranges;

    /**
     * @param array{
     *   date: string,
     *   ranges: array<SchedulingScheduleOverrideRangesItem>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->date = $values['date'];
        $this->ranges = $values['ranges'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
