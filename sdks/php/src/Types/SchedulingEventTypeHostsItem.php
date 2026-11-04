<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingEventTypeHostsItem extends JsonSerializableType
{
    /**
     * @var string $host The host's id.
     */
    #[JsonProperty('host')]
    public string $host;

    /**
     * @var value-of<SchedulingEventTypeHostsItemRole> $role `required` hosts must all be free; one `member` is chosen for a booking.
     */
    #[JsonProperty('role')]
    public string $role;

    /**
     * @var float $weight Share of a pool's bookings relative to other members.
     */
    #[JsonProperty('weight')]
    public float $weight;

    /**
     * @var ?string $schedule The id of the schedule used for this event type. `null`: the host's default schedule.
     */
    #[JsonProperty('schedule')]
    public ?string $schedule;

    /**
     * @param array{
     *   host: string,
     *   role: value-of<SchedulingEventTypeHostsItemRole>,
     *   weight: float,
     *   schedule?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->host = $values['host'];
        $this->role = $values['role'];
        $this->weight = $values['weight'];
        $this->schedule = $values['schedule'] ?? null;
        if (array_key_exists('schedule', $values)) {
            $this->_setField('schedule');
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
