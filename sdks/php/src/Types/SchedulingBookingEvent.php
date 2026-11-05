<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingBookingEvent extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingBookingEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var float $sequence This booking's events count up from 1.
     */
    #[JsonProperty('sequence')]
    public float $sequence;

    /**
     * @var string $type What happened, such as `scheduling.booking.confirmed`, `scheduling.booking.rescheduled` or `scheduling.booking.cancelled`.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var SchedulingBookingEventActor $actor Who did it.
     */
    #[JsonProperty('actor')]
    public SchedulingBookingEventActor $actor;

    /**
     * @var array<string, mixed> $details More about it, such as `previous_start` on a reschedule. Never personal data.
     */
    #[JsonProperty('details'), ArrayType(['string' => 'mixed'])]
    public array $details;

    /**
     * @var string $occurredAt When it happened.
     */
    #[JsonProperty('occurred_at')]
    public string $occurredAt;

    /**
     * @param array{
     *   object: value-of<SchedulingBookingEventObject>,
     *   id: string,
     *   sequence: float,
     *   type: string,
     *   actor: SchedulingBookingEventActor,
     *   details: array<string, mixed>,
     *   occurredAt: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->sequence = $values['sequence'];
        $this->type = $values['type'];
        $this->actor = $values['actor'];
        $this->details = $values['details'];
        $this->occurredAt = $values['occurredAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
