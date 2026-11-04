<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\Union;

/**
 * A test of one field. A field without a value (no IP, no email…) never matches, whatever the operator.
 */
class RiskRuleCondition extends JsonSerializableType
{
    /**
     * @var value-of<RiskRuleConditionField> $field The signal to test, such as `email.disposable` or `ip.country`.
     */
    #[JsonProperty('field')]
    public string $field;

    /**
     * @var value-of<RiskRuleConditionOperator> $operator How to compare. Booleans use `is`, numbers `eq` to `lte`, and strings `eq`, `neq`, `in` and `not_in`.
     */
    #[JsonProperty('operator')]
    public string $operator;

    /**
     * @var (
     *    bool
     *   |float
     *   |string
     *   |array<string>
     * ) $value What to compare it with: its type follows the field, and `in` and `not_in` take a list of strings.
     */
    #[JsonProperty('value'), Union('bool', 'float', 'string', ['string'])]
    public bool|float|string|array $value;

    /**
     * @param array{
     *   field: value-of<RiskRuleConditionField>,
     *   operator: value-of<RiskRuleConditionOperator>,
     *   value: (
     *    bool
     *   |float
     *   |string
     *   |array<string>
     * ),
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->field = $values['field'];
        $this->operator = $values['operator'];
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
