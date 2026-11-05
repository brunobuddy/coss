<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingScheduleOverridesItem extends JsonSerializableType
{
    /**
     * @var string $date The local date, `YYYY-MM-DD`.
     */
    #[JsonProperty('date')]
    public string $date;

    /**
     * @var array<SchedulingScheduleOverridesItemRangesItem> $ranges That day's hours. Empty means unavailable all day.
     */
    #[JsonProperty('ranges'), ArrayType([SchedulingScheduleOverridesItemRangesItem::class])]
    public array $ranges;

    /**
     * @param array{
     *   date: string,
     *   ranges: array<SchedulingScheduleOverridesItemRangesItem>,
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
