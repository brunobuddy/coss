<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingSeries extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingSeriesObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var array<SchedulingBooking> $bookings The occurrences booked, each an ordinary booking.
     */
    #[JsonProperty('bookings'), ArrayType([SchedulingBooking::class])]
    public array $bookings;

    /**
     * @var array<SchedulingSeriesConflictsItem> $conflicts With `on_conflict: skip`, the occurrences that weren't free and weren't booked.
     */
    #[JsonProperty('conflicts'), ArrayType([SchedulingSeriesConflictsItem::class])]
    public array $conflicts;

    /**
     * @param array{
     *   object: value-of<SchedulingSeriesObject>,
     *   id: string,
     *   bookings: array<SchedulingBooking>,
     *   conflicts: array<SchedulingSeriesConflictsItem>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->bookings = $values['bookings'];
        $this->conflicts = $values['conflicts'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
