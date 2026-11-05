<?php

namespace Coss\Email\Audiences\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class UpdateAudienceRequest extends JsonSerializableType
{
    /**
     * @var string $name Your name for the list, unique in the environment.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @param array{
     *   name: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->name = $values['name'];
    }
}
