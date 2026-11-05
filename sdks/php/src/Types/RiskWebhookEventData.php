<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

/**
 * The assessment, without its signals.
 */
class RiskWebhookEventData extends JsonSerializableType
{
    /**
     * @var string $assessmentId The assessment's id.
     */
    #[JsonProperty('assessment_id')]
    public string $assessmentId;

    /**
     * @var value-of<RiskEvent> $event
     */
    #[JsonProperty('event')]
    public string $event;

    /**
     * @var ?string $eventName Your name for a `custom` event. `null`: none.
     */
    #[JsonProperty('event_name')]
    public ?string $eventName;

    /**
     * @var value-of<RiskDecision> $decision
     */
    #[JsonProperty('decision')]
    public string $decision;

    /**
     * @var float $score 0-1: how risky the signals are together.
     */
    #[JsonProperty('score')]
    public float $score;

    /**
     * @var array<RiskReason> $reasons Why, most significant first.
     */
    #[JsonProperty('reasons'), ArrayType([RiskReason::class])]
    public array $reasons;

    /**
     * @var ?string $userId Your user id. `null`: none given.
     */
    #[JsonProperty('user_id')]
    public ?string $userId;

    /**
     * @var ?value-of<RiskOutcome> $outcome `risk.assessment.reviewed`: the outcome that resolved the review.
     */
    #[JsonProperty('outcome')]
    public ?string $outcome;

    /**
     * @var DateTime $occurredAt When this happened.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @param array{
     *   assessmentId: string,
     *   event: value-of<RiskEvent>,
     *   decision: value-of<RiskDecision>,
     *   score: float,
     *   reasons: array<RiskReason>,
     *   occurredAt: DateTime,
     *   eventName?: ?string,
     *   userId?: ?string,
     *   outcome?: ?value-of<RiskOutcome>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->assessmentId = $values['assessmentId'];
        $this->event = $values['event'];
        $this->eventName = $values['eventName'] ?? null;
        if (array_key_exists('eventName', $values)) {
            $this->_setField('eventName');
        }
        $this->decision = $values['decision'];
        $this->score = $values['score'];
        $this->reasons = $values['reasons'];
        $this->userId = $values['userId'] ?? null;
        if (array_key_exists('userId', $values)) {
            $this->_setField('userId');
        }
        $this->outcome = $values['outcome'] ?? null;
        if (array_key_exists('outcome', $values)) {
            $this->_setField('outcome');
        }
        $this->occurredAt = $values['occurredAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
