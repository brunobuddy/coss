<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;

/**
 * Which contacts belong to the segment. Conditions on `property` (custom properties), `email`, `audience` membership, `topic` subscription and `created_at`; one level of nested `{ match, conditions }` groups.
 */
class SegmentFilter extends JsonSerializableType
{
    /**
     * @var float $version The filter's format. Always 1.
     */
    #[JsonProperty('version')]
    public float $version;

    /**
     * @var value-of<SegmentFilterMatch> $match `all`: every condition must hold; `any`: one is enough.
     */
    #[JsonProperty('match')]
    public string $match;

    /**
     * @var array<(
     *    SegmentFilterConditionsItemKey
     *   |SegmentFilterConditionsItemOne
     *   |SegmentFilterConditionsItemAudienceId
     *   |SegmentFilterConditionsItemTopic
     *   |SegmentFilterConditionsItemField
     *   |SegmentFilterConditionsItemConditions
     * )> $conditions Conditions, or `{ match, conditions }` groups of them. At most 20 in all.
     */
    #[JsonProperty('conditions'), ArrayType([new Union(SegmentFilterConditionsItemKey::class, SegmentFilterConditionsItemOne::class, SegmentFilterConditionsItemAudienceId::class, SegmentFilterConditionsItemTopic::class, SegmentFilterConditionsItemField::class, SegmentFilterConditionsItemConditions::class)])]
    public array $conditions;

    /**
     * @param array{
     *   version: float,
     *   match: value-of<SegmentFilterMatch>,
     *   conditions: array<(
     *    SegmentFilterConditionsItemKey
     *   |SegmentFilterConditionsItemOne
     *   |SegmentFilterConditionsItemAudienceId
     *   |SegmentFilterConditionsItemTopic
     *   |SegmentFilterConditionsItemField
     *   |SegmentFilterConditionsItemConditions
     * )>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->version = $values['version'];
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
