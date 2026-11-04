<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class TemplateVariableInputFieldsItem extends JsonSerializableType
{
    /**
     * @var string $name Used inside `{{#each}}` as `{{name}}`.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var value-of<TemplateVariableInputFieldsItemType> $type The field's type.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var ?bool $required Whether each item must have it. Defaults to true.
     */
    #[JsonProperty('required')]
    public ?bool $required;

    /**
     * @param array{
     *   name: string,
     *   type: value-of<TemplateVariableInputFieldsItemType>,
     *   required?: ?bool,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->name = $values['name'];
        $this->type = $values['type'];
        $this->required = $values['required'] ?? null;
        if (array_key_exists('required', $values)) {
            $this->_setField('required');
        }
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
