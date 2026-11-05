<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingLocationZoom extends JsonSerializableType
{
    /**
     * @var ?string $url The meeting's link, once it's created on the host's Zoom account.
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
