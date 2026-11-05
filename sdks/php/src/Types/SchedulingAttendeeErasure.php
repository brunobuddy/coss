<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingAttendeeErasure extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingAttendeeErasureObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $uid The attendee's uid.
     */
    #[JsonProperty('uid')]
    public string $uid;

    /**
     * @var float $erased How many attendee records were erased, one per booking.
     */
    #[JsonProperty('erased')]
    public float $erased;

    /**
     * @param array{
     *   object: value-of<SchedulingAttendeeErasureObject>,
     *   uid: string,
     *   erased: float,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->uid = $values['uid'];
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
