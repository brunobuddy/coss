<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Which opens and clicks are tracked.
 */
class BroadcastTracking extends JsonSerializableType
{
    /**
     * @var bool $opens Whether opens are tracked.
     */
    #[JsonProperty('opens')]
    public bool $opens;

    /**
     * @var bool $clicks Whether clicks are tracked.
     */
    #[JsonProperty('clicks')]
    public bool $clicks;

    /**
     * @param array{
     *   opens: bool,
     *   clicks: bool,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->opens = $values['opens'];
        $this->clicks = $values['clicks'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
