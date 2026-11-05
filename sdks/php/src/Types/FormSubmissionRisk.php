<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Risk's assessment; `null` when none ran (honeypot).
 */
class FormSubmissionRisk extends JsonSerializableType
{
    /**
     * @var ?string $assessmentId The id of Risk's assessment. `null`: none is recorded.
     */
    #[JsonProperty('assessment_id')]
    public ?string $assessmentId;

    /**
     * @var ?value-of<FormSubmissionRiskDecision> $decision Risk's decision. `null`: none is recorded.
     */
    #[JsonProperty('decision')]
    public ?string $decision;

    /**
     * @var ?float $score Risk's score. `null`: none is recorded.
     */
    #[JsonProperty('score')]
    public ?float $score;

    /**
     * @param array{
     *   assessmentId?: ?string,
     *   decision?: ?value-of<FormSubmissionRiskDecision>,
     *   score?: ?float,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->assessmentId = $values['assessmentId'] ?? null;
        if (array_key_exists('assessmentId', $values)) {
            $this->_setField('assessmentId');
        }
        $this->decision = $values['decision'] ?? null;
        if (array_key_exists('decision', $values)) {
            $this->_setField('decision');
        }
        $this->score = $values['score'] ?? null;
        if (array_key_exists('score', $values)) {
            $this->_setField('score');
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
