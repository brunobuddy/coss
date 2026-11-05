<?php

namespace Coss\Scheduling\Holds\Types;

use Coss\Core\Json\JsonSerializableType;

class CreateHoldRequestLocationGoogleMeet extends JsonSerializableType
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
