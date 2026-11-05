<?php

namespace Coss\Scheduling\Holds\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class CreateHoldRequestLocationLink extends JsonSerializableType
{
    /**
     * @var ?string $url The meeting link. `null` on an event type means the booking supplies its own.
     */
    #[JsonProperty('url')]
    public ?string $url;

    /**
     * @param array{
     *   url?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->url = $values['url'] ?? null;
        if (array_key_exists('url', $values)) {
            $this->_setField('url');
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
