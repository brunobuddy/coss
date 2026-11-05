<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class TemplateProblem extends JsonSerializableType
{
    /**
     * @var string $locale The locale whose content it's in.
     */
    #[JsonProperty('locale')]
    public string $locale;

    /**
     * @var value-of<TemplateProblemField> $field The part of the content it's in.
     */
    #[JsonProperty('field')]
    public string $field;

    /**
     * @var string $message What's wrong.
     */
    #[JsonProperty('message')]
    public string $message;

    /**
     * @var int $line The line it's on, from 1.
     */
    #[JsonProperty('line')]
    public int $line;

    /**
     * @var int $column The column it's at, from 1.
     */
    #[JsonProperty('column')]
    public int $column;

    /**
     * @param array{
     *   locale: string,
     *   field: value-of<TemplateProblemField>,
     *   message: string,
     *   line: int,
     *   column: int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->locale = $values['locale'];
        $this->field = $values['field'];
        $this->message = $values['message'];
        $this->line = $values['line'];
        $this->column = $values['column'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
