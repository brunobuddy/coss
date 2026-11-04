<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class CreateSeriesRequestLocationPhone extends JsonSerializableType
{
    /**
     * @var ?string $number The phone number to call. `null` on an event type means the booking supplies its own.
     */
    #[JsonProperty('number')]
    public ?string $number;

    /**
     * @param array{
     *   number?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->number = $values['number'] ?? null;
        if (array_key_exists('number', $values)) {
            $this->_setField('number');
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
