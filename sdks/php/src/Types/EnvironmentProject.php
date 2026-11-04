<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * The project it belongs to.
 */
class EnvironmentProject extends JsonSerializableType
{
    /**
     * @var string $id The project's id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name The project's name.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $slug The project's slug, as in dashboard URLs.
     */
    #[JsonProperty('slug')]
    public string $slug;

    /**
     * @param array{
     *   id: string,
     *   name: string,
     *   slug: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->slug = $values['slug'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
