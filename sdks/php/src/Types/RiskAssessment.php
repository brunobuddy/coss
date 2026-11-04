<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class RiskAssessment extends JsonSerializableType
{
    /**
     * @var value-of<RiskAssessmentObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

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
     * @var float $score 0-1: how risky the signals are together. Lists can decide regardless of the score.
     */
    #[JsonProperty('score')]
    public float $score;

    /**
     * @var array<RiskReason> $reasons Why, most significant first.
     */
    #[JsonProperty('reasons'), ArrayType([RiskReason::class])]
    public array $reasons;

    /**
     * @var RiskAssessmentSignals $signals What the assessment saw, by group. A group is `null` when it had nothing to go on.
     */
    #[JsonProperty('signals')]
    public RiskAssessmentSignals $signals;

    /**
     * @var RiskAssessmentUser $user Who it's about.
     */
    #[JsonProperty('user')]
    public RiskAssessmentUser $user;

    /**
     * @var ?string $ip `null` once removed (90 days after).
     */
    #[JsonProperty('ip')]
    public ?string $ip;

    /**
     * @var array<value-of<RiskAssessmentDegradedItem>> $degraded Signal groups that were unavailable for this assessment (it was made without them). `usage_limit` means the plan's included assessments are used up, or a billing hold or budget applies: the assessment was free and made without velocity, memory of earlier events, content or address-level IP data.
     */
    #[JsonProperty('degraded'), ArrayType(['string'])]
    public array $degraded;

    /**
     * @var ?value-of<RiskOutcome> $outcome The latest outcome you reported with feedback.
     */
    #[JsonProperty('outcome')]
    public ?string $outcome;

    /**
     * @var ?value-of<RiskAssessmentReviewStatus> $reviewStatus `open` for `review` decisions until you send feedback, then `resolved`.
     */
    #[JsonProperty('review_status')]
    public ?string $reviewStatus;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<RiskAssessmentObject>,
     *   id: string,
     *   event: value-of<RiskEvent>,
     *   decision: value-of<RiskDecision>,
     *   score: float,
     *   reasons: array<RiskReason>,
     *   signals: RiskAssessmentSignals,
     *   user: RiskAssessmentUser,
     *   degraded: array<value-of<RiskAssessmentDegradedItem>>,
     *   createdAt: DateTime,
     *   eventName?: ?string,
     *   ip?: ?string,
     *   outcome?: ?value-of<RiskOutcome>,
     *   reviewStatus?: ?value-of<RiskAssessmentReviewStatus>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->event = $values['event'];
        $this->eventName = $values['eventName'] ?? null;
        if (array_key_exists('eventName', $values)) {
            $this->_setField('eventName');
        }
        $this->decision = $values['decision'];
        $this->score = $values['score'];
        $this->reasons = $values['reasons'];
        $this->signals = $values['signals'];
        $this->user = $values['user'];
        $this->ip = $values['ip'] ?? null;
        if (array_key_exists('ip', $values)) {
            $this->_setField('ip');
        }
        $this->degraded = $values['degraded'];
        $this->outcome = $values['outcome'] ?? null;
        if (array_key_exists('outcome', $values)) {
            $this->_setField('outcome');
        }
        $this->reviewStatus = $values['reviewStatus'] ?? null;
        if (array_key_exists('reviewStatus', $values)) {
            $this->_setField('reviewStatus');
        }
        $this->createdAt = $values['createdAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
