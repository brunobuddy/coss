<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * A header sent with every batch, for intake APIs that take a key: `Authorization` (`Basic …`, `Bearer …`), `DD-API-KEY`… Its value is stored encrypted and never returned. `null` removes it.
 */
class LogDrainAuthHeader extends JsonSerializableType
{
    /**
     * @var string $name The header's name.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $value The header's value. Encrypted, and never returned.
     */
    #[JsonProperty('value')]
    public string $value;

    /**
     * @param array{
     *   name: string,
     *   value: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->name = $values['name'];
        $this->value = $values['value'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
