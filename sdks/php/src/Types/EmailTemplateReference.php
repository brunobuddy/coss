<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class EmailTemplateReference extends JsonSerializableType
{
    /**
     * @var string $id The template's id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var ?int $version `null` for a dashboard test send of the draft.
     */
    #[JsonProperty('version')]
    public ?int $version;

    /**
     * @var string $locale The locale the email was rendered in.
     */
    #[JsonProperty('locale')]
    public string $locale;

    /**
     * @param array{
     *   id: string,
     *   locale: string,
     *   version?: ?int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->version = $values['version'] ?? null;
        if (array_key_exists('version', $values)) {
            $this->_setField('version');
        }
        $this->locale = $values['locale'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
