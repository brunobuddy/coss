<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingSlotExplanation extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingSlotExplanationObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $start The start asked about.
     */
    #[JsonProperty('start')]
    public string $start;

    /**
     * @var string $end When it would end.
     */
    #[JsonProperty('end')]
    public string $end;

    /**
     * @var bool $available Whether it can be booked right now.
     */
    #[JsonProperty('available')]
    public bool $available;

    /**
     * @var ?string $reason Why it can't: `not_on_grid`, `too_soon`, `outside_booking_window`, `calendar_unverified`, `outside_availability`, `host_busy`, `already_claimed`, `limit_reached` or `session_full`, or `event_type_inactive` or `no_hosts`. `null` when it can. With several hosts refused, the first one's reason: see `hosts`.
     */
    #[JsonProperty('reason')]
    public ?string $reason;

    /**
     * @var array<SchedulingSlotExplanationHostsItem> $hosts Everyone who could take this event type, narrowed by the query.
     */
    #[JsonProperty('hosts'), ArrayType([SchedulingSlotExplanationHostsItem::class])]
    public array $hosts;

    /**
     * @param array{
     *   object: value-of<SchedulingSlotExplanationObject>,
     *   start: string,
     *   end: string,
     *   available: bool,
     *   hosts: array<SchedulingSlotExplanationHostsItem>,
     *   reason?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->start = $values['start'];
        $this->end = $values['end'];
        $this->available = $values['available'];
        $this->reason = $values['reason'] ?? null;
        if (array_key_exists('reason', $values)) {
            $this->_setField('reason');
        }
        $this->hosts = $values['hosts'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
