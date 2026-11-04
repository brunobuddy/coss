<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * How often the booking repeats, at the attendee's local time.
 */
class CreateSeriesRequestRecurrence extends JsonSerializableType
{
    /**
     * @var value-of<CreateSeriesRequestRecurrenceFrequency> $frequency Repeat weekly or monthly.
     */
    #[JsonProperty('frequency')]
    public string $frequency;

    /**
     * @var ?int $interval Every this many weeks or months. Default: 1.
     */
    #[JsonProperty('interval')]
    public ?int $interval;

    /**
     * @var int $count Occurrences in total, the first included.
     */
    #[JsonProperty('count')]
    public int $count;

    /**
     * @param array{
     *   frequency: value-of<CreateSeriesRequestRecurrenceFrequency>,
     *   count: int,
     *   interval?: ?int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->frequency = $values['frequency'];
        $this->interval = $values['interval'] ?? null;
        if (array_key_exists('interval', $values)) {
            $this->_setField('interval');
        }
        $this->count = $values['count'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
