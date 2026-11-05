<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SignTemplateRolesItem extends JsonSerializableType
{
    /**
     * @var string $key The role's id within the template.
     */
    #[JsonProperty('key')]
    public string $key;

    /**
     * @var string $name Shown in the builder, e.g. `Client`.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @param array{
     *   key: string,
     *   name: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->key = $values['key'];
        $this->name = $values['name'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
