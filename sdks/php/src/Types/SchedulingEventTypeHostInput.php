<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingEventTypeHostInput extends JsonSerializableType
{
    /**
     * @var string $host The host's id or uid.
     */
    #[JsonProperty('host')]
    public string $host;

    /**
     * @var ?value-of<SchedulingEventTypeHostInputRole> $role `required` hosts must all be free; one `member` is chosen for a booking.
     */
    #[JsonProperty('role')]
    public ?string $role;

    /**
     * @var ?int $weight Share of a pool's bookings relative to other members.
     */
    #[JsonProperty('weight')]
    public ?int $weight;

    /**
     * @var ?string $schedule A schedule of this host's. Default: their default schedule.
     */
    #[JsonProperty('schedule')]
    public ?string $schedule;

    /**
     * @param array{
     *   host: string,
     *   role?: ?value-of<SchedulingEventTypeHostInputRole>,
     *   weight?: ?int,
     *   schedule?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->host = $values['host'];
        $this->role = $values['role'] ?? null;
        if (array_key_exists('role', $values)) {
            $this->_setField('role');
        }
        $this->weight = $values['weight'] ?? null;
        if (array_key_exists('weight', $values)) {
            $this->_setField('weight');
        }
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
