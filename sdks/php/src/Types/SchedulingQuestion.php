<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * Something attendees are asked when booking. Answers are encrypted, and come back only when you retrieve one booking.
 */
class SchedulingQuestion extends JsonSerializableType
{
    /**
     * @var string $key The answer's key in `answers`. Unique within the event type.
     */
    #[JsonProperty('key')]
    public string $key;

    /**
     * @var value-of<SchedulingQuestionType> $type How it's asked and which answers are valid.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var string $label The question as attendees see it.
     */
    #[JsonProperty('label')]
    public string $label;

    /**
     * @var ?bool $required Whether a booking must answer it.
     */
    #[JsonProperty('required')]
    public ?bool $required;

    /**
     * @var ?array<string> $options The choices of a `select`, `radio` or `checkbox` question. `select` and `radio` need at least one.
     */
    #[JsonProperty('options'), ArrayType(['string'])]
    public ?array $options;

    /**
     * @param array{
     *   key: string,
     *   type: value-of<SchedulingQuestionType>,
     *   label: string,
     *   required?: ?bool,
     *   options?: ?array<string>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->key = $values['key'];
        $this->type = $values['type'];
        $this->label = $values['label'];
        $this->required = $values['required'] ?? null;
        if (array_key_exists('required', $values)) {
            $this->_setField('required');
        }
        $this->options = $values['options'] ?? null;
        if (array_key_exists('options', $values)) {
            $this->_setField('options');
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
