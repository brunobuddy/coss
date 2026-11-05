<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class RiskCalibrationRule extends JsonSerializableType
{
    /**
     * @var string $rule The rule's id.
     */
    #[JsonProperty('rule')]
    public string $rule;

    /**
     * @var string $name The rule's name.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var int $matched Assessments it decided.
     */
    #[JsonProperty('matched')]
    public int $matched;

    /**
     * @var int $fraud With feedback `fraud` or `abuse`.
     */
    #[JsonProperty('fraud')]
    public int $fraud;

    /**
     * @var int $legitimate With feedback `legitimate`.
     */
    #[JsonProperty('legitimate')]
    public int $legitimate;

    /**
     * @var ?float $precision `fraud / (fraud + legitimate)`: how often it was right when you told coss.com. `null` without feedback.
     */
    #[JsonProperty('precision')]
    public ?float $precision;

    /**
     * @param array{
     *   rule: string,
     *   name: string,
     *   matched: int,
     *   fraud: int,
     *   legitimate: int,
     *   precision?: ?float,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->rule = $values['rule'];
        $this->name = $values['name'];
        $this->matched = $values['matched'];
        $this->fraud = $values['fraud'];
        $this->legitimate = $values['legitimate'];
        $this->precision = $values['precision'] ?? null;
        if (array_key_exists('precision', $values)) {
            $this->_setField('precision');
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
