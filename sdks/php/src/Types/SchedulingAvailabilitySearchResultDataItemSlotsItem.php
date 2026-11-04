<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingAvailabilitySearchResultDataItemSlotsItem extends JsonSerializableType
{
    /**
     * @var string $start When the slot starts.
     */
    #[JsonProperty('start')]
    public string $start;

    /**
     * @var string $end When the slot ends.
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
