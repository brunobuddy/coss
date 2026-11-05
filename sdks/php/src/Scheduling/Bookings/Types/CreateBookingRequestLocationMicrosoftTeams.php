<?php

namespace Coss\Scheduling\Bookings\Types;

use Coss\Core\Json\JsonSerializableType;

class CreateBookingRequestLocationMicrosoftTeams extends JsonSerializableType
{
    /**
     * @param array{
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        unset($values);
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
