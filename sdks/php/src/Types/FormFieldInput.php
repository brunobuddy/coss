<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class FormFieldInput extends JsonSerializableType
{
    /**
     * @var string $name The `name` the form's input posts.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var value-of<FormFieldInputType> $type Validates the value (`email`, `number`, `url`, `date` as `YYYY-MM-DD`, `select`/`radio` one of `options`, `checkbox` any of them or `on`) and picks the input on hosted pages. `file` needs uploads on (`files.enabled`).
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var ?string $label Shown on hosted pages and in notifications. Default: the name.
     */
    #[JsonProperty('label')]
    public ?string $label;

    /**
     * @var ?bool $required Default false.
     */
    #[JsonProperty('required')]
    public ?bool $required;

    /**
     * @var ?string $placeholder Shown in the empty input on hosted pages.
     */
    #[JsonProperty('placeholder')]
    public ?string $placeholder;

    /**
     * @var ?array<string> $options The choices of `select`, `radio` and `checkbox` fields.
     */
    #[JsonProperty('options'), ArrayType(['string'])]
    public ?array $options;

    /**
     * @var ?int $maxLength The longest value accepted, in characters.
     */
    #[JsonProperty('max_length')]
    public ?int $maxLength;

    /**
     * @param array{
     *   name: string,
     *   type: value-of<FormFieldInputType>,
     *   label?: ?string,
     *   required?: ?bool,
     *   placeholder?: ?string,
     *   options?: ?array<string>,
     *   maxLength?: ?int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->name = $values['name'];
        $this->type = $values['type'];
        $this->label = $values['label'] ?? null;
        if (array_key_exists('label', $values)) {
            $this->_setField('label');
        }
        $this->required = $values['required'] ?? null;
        if (array_key_exists('required', $values)) {
            $this->_setField('required');
        }
        $this->placeholder = $values['placeholder'] ?? null;
        if (array_key_exists('placeholder', $values)) {
            $this->_setField('placeholder');
        }
        $this->options = $values['options'] ?? null;
        if (array_key_exists('options', $values)) {
            $this->_setField('options');
        }
        $this->maxLength = $values['maxLength'] ?? null;
        if (array_key_exists('maxLength', $values)) {
            $this->_setField('maxLength');
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
