<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SegmentFilterConditionsItemConditions extends JsonSerializableType
{
    /**
     * @var value-of<SegmentFilterConditionsItemConditionsMatch> $match `all`: every condition must hold; `any`: one is enough.
     */
    #[JsonProperty('match')]
    public string $match;

    /**
     * @var array<SegmentFilterConditionsItemConditionsConditionsItem> $conditions The group's conditions.
     */
    #[JsonProperty('conditions'), ArrayType([SegmentFilterConditionsItemConditionsConditionsItem::class])]
    public array $conditions;

    /**
     * @param array{
     *   match: value-of<SegmentFilterConditionsItemConditionsMatch>,
     *   conditions: array<SegmentFilterConditionsItemConditionsConditionsItem>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->match = $values['match'];
        $this->conditions = $values['conditions'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
