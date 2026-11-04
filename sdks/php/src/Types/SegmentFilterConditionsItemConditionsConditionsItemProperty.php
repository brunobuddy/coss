<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\Union;

class SegmentFilterConditionsItemConditionsConditionsItemProperty extends JsonSerializableType
{
    /**
     * @var string $key The custom property to test.
     */
    #[JsonProperty('key')]
    public string $key;

    /**
     * @var value-of<SegmentFilterConditionsItemConditionsConditionsItemPropertyOp> $op How to compare: `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `contains`, `starts_with`, or `exists` and `not_exists`, which take no value.
     */
    #[JsonProperty('op')]
    public string $op;

    /**
     * @var (
     *    string
     *   |float
     *   |bool
     *   |array<(
     *    string
     *   |float
     *   |bool
     * )>
     * )|null $value A list for `in`/`not_in`; none for `exists`/`not_exists`.
     */
    #[JsonProperty('value'), Union('string', 'float', 'bool', [new Union('string', 'float', 'bool')], 'null')]
    public string|float|bool|array|null $value;

    /**
     * @param array{
     *   key: string,
     *   op: value-of<SegmentFilterConditionsItemConditionsConditionsItemPropertyOp>,
     *   value?: (
     *    string
     *   |float
     *   |bool
     *   |array<(
     *    string
     *   |float
     *   |bool
     * )>
     * )|null,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->key = $values['key'];
        $this->op = $values['op'];
        $this->value = $values['value'] ?? null;
        if (array_key_exists('value', $values)) {
            $this->_setField('value');
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
