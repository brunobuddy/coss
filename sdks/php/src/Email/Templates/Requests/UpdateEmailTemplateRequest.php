<?php

namespace Coss\Email\Templates\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class UpdateEmailTemplateRequest extends JsonSerializableType
{
    /**
     * @var ?string $name Shown in the dashboard.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?string $alias `null` removes the alias.
     */
    #[JsonProperty('alias')]
    public ?string $alias;

    /**
     * @var ?string $description Your note about it. `null` removes it.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @param array{
     *   name?: ?string,
     *   alias?: ?string,
     *   description?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
        $this->alias = $values['alias'] ?? null;
        if (array_key_exists('alias', $values)) {
            $this->_setField('alias');
        }
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
    }
}
