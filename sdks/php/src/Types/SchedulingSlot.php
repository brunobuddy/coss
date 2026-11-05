<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingSlot extends JsonSerializableType
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
     * @var array<string> $hosts Who could take it.
     */
    #[JsonProperty('hosts'), ArrayType(['string'])]
    public array $hosts;

    /**
     * @var ?float $seatsLeft Free seats at this start, for a `group` event type. `null` for the others.
     */
    #[JsonProperty('seats_left')]
    public ?float $seatsLeft;

    /**
     * @param array{
     *   start: string,
     *   end: string,
     *   hosts: array<string>,
     *   seatsLeft?: ?float,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->start = $values['start'];
        $this->end = $values['end'];
        $this->hosts = $values['hosts'];
        $this->seatsLeft = $values['seatsLeft'] ?? null;
        if (array_key_exists('seatsLeft', $values)) {
            $this->_setField('seatsLeft');
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
