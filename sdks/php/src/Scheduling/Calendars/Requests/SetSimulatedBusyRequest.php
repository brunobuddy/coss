<?php

namespace Coss\Scheduling\Calendars\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Scheduling\Calendars\Types\SetSimulatedBusyRequestIntervalsItem;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SetSimulatedBusyRequest extends JsonSerializableType
{
    /**
     * @var array<SetSimulatedBusyRequestIntervalsItem> $intervals The simulated calendar's busy times.
     */
    #[JsonProperty('intervals'), ArrayType([SetSimulatedBusyRequestIntervalsItem::class])]
    public array $intervals;

    /**
     * @param array{
     *   intervals: array<SetSimulatedBusyRequestIntervalsItem>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->intervals = $values['intervals'];
    }
}
