<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * Feedback against the reasons and rules that fired, over the last 90 days. Feedback you give mostly on reviews and blocks over-represents those: read precision as a guide, not a measurement.
 */
class RiskCalibration extends JsonSerializableType
{
    /**
     * @var value-of<RiskCalibrationObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var int $windowDays How many days back it looks.
     */
    #[JsonProperty('window_days')]
    public int $windowDays;

    /**
     * @var int $assessments Assessments in the window.
     */
    #[JsonProperty('assessments')]
    public int $assessments;

    /**
     * @var int $labeled Of those, with feedback.
     */
    #[JsonProperty('labeled')]
    public int $labeled;

    /**
     * @var array<RiskCalibrationReason> $reasons How each reason did against your feedback.
     */
    #[JsonProperty('reasons'), ArrayType([RiskCalibrationReason::class])]
    public array $reasons;

    /**
     * @var array<RiskCalibrationRule> $rules How each rule did against your feedback.
     */
    #[JsonProperty('rules'), ArrayType([RiskCalibrationRule::class])]
    public array $rules;

    /**
     * @param array{
     *   object: value-of<RiskCalibrationObject>,
     *   windowDays: int,
     *   assessments: int,
     *   labeled: int,
     *   reasons: array<RiskCalibrationReason>,
     *   rules: array<RiskCalibrationRule>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->windowDays = $values['windowDays'];
        $this->assessments = $values['assessments'];
        $this->labeled = $values['labeled'];
        $this->reasons = $values['reasons'];
        $this->rules = $values['rules'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
