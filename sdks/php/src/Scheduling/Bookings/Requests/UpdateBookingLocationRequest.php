<?php

namespace Coss\Scheduling\Bookings\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Types\SchedulingLocation;
use Coss\Core\Json\JsonProperty;

class UpdateBookingLocationRequest extends JsonSerializableType
{
    /**
     * @var SchedulingLocation $location
     */
    #[JsonProperty('location')]
    public SchedulingLocation $location;

    /**
     * @param array{
     *   location: SchedulingLocation,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->location = $values['location'];
    }
}
