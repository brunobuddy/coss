<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\Union;
use Coss\Core\Types\ArrayType;

class TemplateVariableInput extends JsonSerializableType
{
    /**
     * @var string $name Used in the template as `{{name}}`.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var value-of<TemplateVariableInputType> $type `string`, `number`, `boolean`, or `list` (an array of objects with the declared `fields`, looped over with `{{#each name}}`).
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var ?bool $required Sends must pass it unless it has a `default`. Defaults to true.
     */
    #[JsonProperty('required')]
    public ?bool $required;

    /**
     * @var (
     *    string
     *   |float
     *   |bool
     * )|null $default Used when a send leaves it out. Not for lists.
     */
    #[JsonProperty('default'), Union('string', 'float', 'bool', 'null')]
    public string|float|bool|null $default;

    /**
     * @var ?string $description What it's for, shown in the dashboard.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var ?array<TemplateVariableInputFieldsItem> $fields A list's item fields (required for lists, only for lists).
     */
    #[JsonProperty('fields'), ArrayType([TemplateVariableInputFieldsItem::class])]
    public ?array $fields;

    /**
     * @param array{
     *   name: string,
     *   type: value-of<TemplateVariableInputType>,
     *   required?: ?bool,
     *   default?: (
     *    string
     *   |float
     *   |bool
     * )|null,
     *   description?: ?string,
     *   fields?: ?array<TemplateVariableInputFieldsItem>,
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
        $this->default = $values['default'] ?? null;
        if (array_key_exists('default', $values)) {
            $this->_setField('default');
        }
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->fields = $values['fields'] ?? null;
        if (array_key_exists('fields', $values)) {
            $this->_setField('fields');
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
