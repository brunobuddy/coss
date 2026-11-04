<?php

namespace Coss\Scheduling\Calendars\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SetSimulatedBusyRequestIntervalsItem extends JsonSerializableType
{
    /**
     * @var string $start An ISO 8601 instant with an offset.
     */
    #[JsonProperty('start')]
    public string $start;

    /**
     * @var string $end An ISO 8601 instant with an offset.
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
