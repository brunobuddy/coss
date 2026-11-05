<?php

namespace Coss\Scheduling\Settings\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Your logo, a PNG or JPEG. `null` removes it.
 */
class UpdateSchedulingSettingsRequestLogo extends JsonSerializableType
{
    /**
     * @var string $content A PNG or JPEG's bytes, base64-encoded. 200 KB at most.
     */
    #[JsonProperty('content')]
    public string $content;

    /**
     * @param array{
     *   content: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->content = $values['content'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
