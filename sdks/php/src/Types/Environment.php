<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * The environment an API key belongs to, with its project and organization.
 */
class Environment extends JsonSerializableType
{
    /**
     * @var value-of<EnvironmentObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id The environment's id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name The environment's name.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $slug The environment's slug, as in dashboard URLs.
     */
    #[JsonProperty('slug')]
    public string $slug;

    /**
     * @var value-of<EnvironmentMode> $mode `live` delivers email; `sandbox` (`coss_test_` keys) never does.
     */
    #[JsonProperty('mode')]
    public string $mode;

    /**
     * @var EnvironmentProject $project The project it belongs to.
     */
    #[JsonProperty('project')]
    public EnvironmentProject $project;

    /**
     * @var EnvironmentOrganization $organization The organization it belongs to.
     */
    #[JsonProperty('organization')]
    public EnvironmentOrganization $organization;

    /**
     * @var EnvironmentApiKey $apiKey The API key making this request.
     */
    #[JsonProperty('api_key')]
    public EnvironmentApiKey $apiKey;

    /**
     * @param array{
     *   object: value-of<EnvironmentObject>,
     *   id: string,
     *   name: string,
     *   slug: string,
     *   mode: value-of<EnvironmentMode>,
     *   project: EnvironmentProject,
     *   organization: EnvironmentOrganization,
     *   apiKey: EnvironmentApiKey,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->slug = $values['slug'];
        $this->mode = $values['mode'];
        $this->project = $values['project'];
        $this->organization = $values['organization'];
        $this->apiKey = $values['apiKey'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
