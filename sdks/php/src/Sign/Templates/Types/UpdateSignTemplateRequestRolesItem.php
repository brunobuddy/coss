<?php

namespace Coss\Sign\Templates\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class UpdateSignTemplateRequestRolesItem extends JsonSerializableType
{
    /**
     * @var string $key The role's id within the template, used by fields and signers.
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
