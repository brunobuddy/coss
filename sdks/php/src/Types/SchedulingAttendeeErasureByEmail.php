<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingAttendeeErasureByEmail extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingAttendeeErasureByEmailObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var float $erased How many attendee and guest records were erased.
     */
    #[JsonProperty('erased')]
    public float $erased;

    /**
     * @param array{
     *   object: value-of<SchedulingAttendeeErasureByEmailObject>,
     *   erased: float,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->erased = $values['erased'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
