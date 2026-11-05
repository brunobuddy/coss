<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingSlotExplanationHostsItem extends JsonSerializableType
{
    /**
     * @var string $host The host's id.
     */
    #[JsonProperty('host')]
    public string $host;

    /**
     * @var value-of<SchedulingSlotExplanationHostsItemRole> $role `required` hosts must all be free. Only one `member` needs to be.
     */
    #[JsonProperty('role')]
    public string $role;

    /**
     * @var bool $available Whether this host could take it.
     */
    #[JsonProperty('available')]
    public bool $available;

    /**
     * @var ?string $reason Why not: `not_on_grid`, `too_soon`, `outside_booking_window`, `calendar_unverified`, `outside_availability`, `host_busy`, `already_claimed`, `limit_reached` or `session_full`. `null` when they could.
     */
    #[JsonProperty('reason')]
    public ?string $reason;

    /**
     * @var ?string $calendarReason With `calendar_unverified`: `calendar_needs_reauth`, `calendar_stale` or `calendar_not_covered`.
     */
    #[JsonProperty('calendar_reason')]
    public ?string $calendarReason;

    /**
     * @param array{
     *   host: string,
     *   role: value-of<SchedulingSlotExplanationHostsItemRole>,
     *   available: bool,
     *   reason?: ?string,
     *   calendarReason?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->host = $values['host'];
        $this->role = $values['role'];
        $this->available = $values['available'];
        $this->reason = $values['reason'] ?? null;
        if (array_key_exists('reason', $values)) {
            $this->_setField('reason');
        }
        $this->calendarReason = $values['calendarReason'] ?? null;
        if (array_key_exists('calendarReason', $values)) {
            $this->_setField('calendarReason');
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
