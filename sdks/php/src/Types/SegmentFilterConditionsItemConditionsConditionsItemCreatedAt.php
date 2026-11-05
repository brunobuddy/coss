<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Union;

class SegmentFilterConditionsItemConditionsConditionsItemCreatedAt extends JsonSerializableType
{
    /**
     * @var value-of<SegmentFilterConditionsItemConditionsConditionsItemCreatedAtOp> $op `before` or `after` a time, or created `within_days` the last days.
     */
    #[JsonProperty('op')]
    public string $op;

    /**
     * @var (
     *    DateTime
     *   |int
     * ) $value A timestamp for `before`/`after`, a number of days for `within_days`.
     */
    #[JsonProperty('value'), Union('datetime', 'integer')]
    public DateTime|int $value;

    /**
     * @param array{
     *   op: value-of<SegmentFilterConditionsItemConditionsConditionsItemCreatedAtOp>,
     *   value: (
     *    DateTime
     *   |int
     * ),
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->op = $values['op'];
        $this->value = $values['value'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
