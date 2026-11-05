<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * The organization it belongs to.
 */
class EnvironmentOrganization extends JsonSerializableType
{
    /**
     * @var string $id The organization's id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name The organization's name.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $slug The organization's slug, as in dashboard URLs.
     */
    #[JsonProperty('slug')]
    public string $slug;

    /**
     * @var string $apiVersion The organization's pinned API version: what requests without a `Coss-Version` header and new webhook endpoints get.
     */
    #[JsonProperty('api_version')]
    public string $apiVersion;

    /**
     * @var bool $hipaaMode Whether the organization is in HIPAA mode, which refuses some requests with `hipaa_mode_restriction`. Its compliance settings page lists what the mode changes.
     */
    #[JsonProperty('hipaa_mode')]
    public bool $hipaaMode;

    /**
     * @param array{
     *   id: string,
     *   name: string,
     *   slug: string,
     *   apiVersion: string,
     *   hipaaMode: bool,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->slug = $values['slug'];
        $this->apiVersion = $values['apiVersion'];
        $this->hipaaMode = $values['hipaaMode'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
