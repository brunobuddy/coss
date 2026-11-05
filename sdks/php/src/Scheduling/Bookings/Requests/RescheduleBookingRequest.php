<?php

namespace Coss\Scheduling\Bookings\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class RescheduleBookingRequest extends JsonSerializableType
{
    /**
     * @var string $start The new start. The old time stays booked unless this one's free.
     */
    #[JsonProperty('start')]
    public string $start;

    /**
     * @var ?string $host Move a pool booking to this host. Default: its current hosts.
     */
    #[JsonProperty('host')]
    public ?string $host;

    /**
     * @param array{
     *   start: string,
     *   host?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->start = $values['start'];
        $this->host = $values['host'] ?? null;
        if (array_key_exists('host', $values)) {
            $this->_setField('host');
        }
    }
}
