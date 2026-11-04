<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingHostLocationInPerson extends JsonSerializableType
{
    /**
     * @var string $address The address. It can't contain a link.
     */
    #[JsonProperty('address')]
    public string $address;

    /**
     * @param array{
     *   address: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->address = $values['address'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
