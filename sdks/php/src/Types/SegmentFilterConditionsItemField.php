<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Union;

class SegmentFilterConditionsItemField extends JsonSerializableType
{
    /**
     * @var value-of<SegmentFilterConditionsItemFieldField> $field
     */
    #[JsonProperty('field')]
    public string $field;

    /**
     * @var value-of<SegmentFilterConditionsItemFieldOp> $op `before` or `after` a time, or created `within_days` the last days.
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
     *   field: value-of<SegmentFilterConditionsItemFieldField>,
     *   op: value-of<SegmentFilterConditionsItemFieldOp>,
     *   value: (
     *    DateTime
     *   |int
     * ),
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->field = $values['field'];
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
