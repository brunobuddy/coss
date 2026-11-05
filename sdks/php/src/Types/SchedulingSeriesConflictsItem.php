<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingSeriesConflictsItem extends JsonSerializableType
{
    /**
     * @var float $index The occurrence's place in the series, from 0.
     */
    #[JsonProperty('index')]
    public float $index;

    /**
     * @var string $start When it would have started.
     */
    #[JsonProperty('start')]
    public string $start;

    /**
     * @param array{
     *   index: float,
     *   start: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->index = $values['index'];
        $this->start = $values['start'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
