<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingLocationInPerson extends JsonSerializableType
{
    /**
     * @var ?string $address The address to meet at. `null` on an event type means the booking supplies its own.
     */
    #[JsonProperty('address')]
    public ?string $address;

    /**
     * @param array{
     *   address?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->address = $values['address'] ?? null;
        if (array_key_exists('address', $values)) {
            $this->_setField('address');
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
