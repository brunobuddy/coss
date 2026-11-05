<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class Broadcast extends JsonSerializableType
{
    /**
     * @var value-of<BroadcastObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name Shown only to you.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var value-of<BroadcastStatus> $status `draft` (editable), `scheduled`, `sending`, `paused` (see `pause_reason`), `sent`, `canceled`, or `failed` (see `error`).
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var ?string $audienceId The audience it goes to. `null`: a segment.
     */
    #[JsonProperty('audience_id')]
    public ?string $audienceId;

    /**
     * @var ?string $segmentId The segment it goes to. `null`: an audience.
     */
    #[JsonProperty('segment_id')]
    public ?string $segmentId;

    /**
     * @var ?string $topic The topic it's about (its key), and its emails' `category`. `null`: none.
     */
    #[JsonProperty('topic')]
    public ?string $topic;

    /**
     * @var string $from Who it's sent from.
     */
    #[JsonProperty('from')]
    public string $from;

    /**
     * @var array<string> $replyTo Addresses replies go to.
     */
    #[JsonProperty('reply_to'), ArrayType(['string'])]
    public array $replyTo;

    /**
     * @var string $subject The subject, before contact fields are filled in.
     */
    #[JsonProperty('subject')]
    public string $subject;

    /**
     * @var ?string $previewText The inbox preview line. `null`: none.
     */
    #[JsonProperty('preview_text')]
    public ?string $previewText;

    /**
     * @var ?string $html The HTML part, before contact fields are filled in. `null`: text only.
     */
    #[JsonProperty('html')]
    public ?string $html;

    /**
     * @var ?string $text The plain text part. `null`: HTML only.
     */
    #[JsonProperty('text')]
    public ?string $text;

    /**
     * @var BroadcastTracking $tracking Which opens and clicks are tracked.
     */
    #[JsonProperty('tracking')]
    public BroadcastTracking $tracking;

    /**
     * @var ?int $ratePerSecond Recipients per second. `null`: the plan's marketing rate.
     */
    #[JsonProperty('rate_per_second')]
    public ?int $ratePerSecond;

    /**
     * @var ?DateTime $scheduledAt When it's set to start. `null`: not scheduled.
     */
    #[JsonProperty('scheduled_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $scheduledAt;

    /**
     * @var ?DateTime $startedAt When sending started. `null`: it hasn't.
     */
    #[JsonProperty('started_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $startedAt;

    /**
     * @var ?DateTime $completedAt When it finished. `null`: it hasn't.
     */
    #[JsonProperty('completed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $completedAt;

    /**
     * @var ?DateTime $canceledAt When it was canceled. `null`: it wasn't.
     */
    #[JsonProperty('canceled_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $canceledAt;

    /**
     * @var ?int $recipientsEstimated How many contacts it would reach, counted when it started.
     */
    #[JsonProperty('recipients_estimated')]
    public ?int $recipientsEstimated;

    /**
     * @var ?string $pauseReason Why a paused broadcast waits: `paused` (by you), `billing_hold`, `budget_exceeded`, `usage_limit`, `marketing_paused`, `account_suspended`, `sending_paused`.
     */
    #[JsonProperty('pause_reason')]
    public ?string $pauseReason;

    /**
     * @var ?BroadcastError $error Why it `failed`, such as `target_unavailable` when its audience, segment or topic was deleted while sending. `null`: it didn't.
     */
    #[JsonProperty('error')]
    public ?BroadcastError $error;

    /**
     * @var BroadcastStats $stats
     */
    #[JsonProperty('stats')]
    public BroadcastStats $stats;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var DateTime $updatedAt
     */
    #[JsonProperty('updated_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $updatedAt;

    /**
     * @param array{
     *   object: value-of<BroadcastObject>,
     *   id: string,
     *   name: string,
     *   status: value-of<BroadcastStatus>,
     *   from: string,
     *   replyTo: array<string>,
     *   subject: string,
     *   tracking: BroadcastTracking,
     *   stats: BroadcastStats,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   audienceId?: ?string,
     *   segmentId?: ?string,
     *   topic?: ?string,
     *   previewText?: ?string,
     *   html?: ?string,
     *   text?: ?string,
     *   ratePerSecond?: ?int,
     *   scheduledAt?: ?DateTime,
     *   startedAt?: ?DateTime,
     *   completedAt?: ?DateTime,
     *   canceledAt?: ?DateTime,
     *   recipientsEstimated?: ?int,
     *   pauseReason?: ?string,
     *   error?: ?BroadcastError,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->status = $values['status'];
        $this->audienceId = $values['audienceId'] ?? null;
        if (array_key_exists('audienceId', $values)) {
            $this->_setField('audienceId');
        }
        $this->segmentId = $values['segmentId'] ?? null;
        if (array_key_exists('segmentId', $values)) {
            $this->_setField('segmentId');
        }
        $this->topic = $values['topic'] ?? null;
        if (array_key_exists('topic', $values)) {
            $this->_setField('topic');
        }
        $this->from = $values['from'];
        $this->replyTo = $values['replyTo'];
        $this->subject = $values['subject'];
        $this->previewText = $values['previewText'] ?? null;
        if (array_key_exists('previewText', $values)) {
            $this->_setField('previewText');
        }
        $this->html = $values['html'] ?? null;
        if (array_key_exists('html', $values)) {
            $this->_setField('html');
        }
        $this->text = $values['text'] ?? null;
        if (array_key_exists('text', $values)) {
            $this->_setField('text');
        }
        $this->tracking = $values['tracking'];
        $this->ratePerSecond = $values['ratePerSecond'] ?? null;
        if (array_key_exists('ratePerSecond', $values)) {
            $this->_setField('ratePerSecond');
        }
        $this->scheduledAt = $values['scheduledAt'] ?? null;
        if (array_key_exists('scheduledAt', $values)) {
            $this->_setField('scheduledAt');
        }
        $this->startedAt = $values['startedAt'] ?? null;
        if (array_key_exists('startedAt', $values)) {
            $this->_setField('startedAt');
        }
        $this->completedAt = $values['completedAt'] ?? null;
        if (array_key_exists('completedAt', $values)) {
            $this->_setField('completedAt');
        }
        $this->canceledAt = $values['canceledAt'] ?? null;
        if (array_key_exists('canceledAt', $values)) {
            $this->_setField('canceledAt');
        }
        $this->recipientsEstimated = $values['recipientsEstimated'] ?? null;
        if (array_key_exists('recipientsEstimated', $values)) {
            $this->_setField('recipientsEstimated');
        }
        $this->pauseReason = $values['pauseReason'] ?? null;
        if (array_key_exists('pauseReason', $values)) {
            $this->_setField('pauseReason');
        }
        $this->error = $values['error'] ?? null;
        if (array_key_exists('error', $values)) {
            $this->_setField('error');
        }
        $this->stats = $values['stats'];
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
