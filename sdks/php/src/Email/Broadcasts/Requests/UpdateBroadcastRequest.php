<?php

namespace Coss\Email\Broadcasts\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Email\Broadcasts\Types\UpdateBroadcastRequestTracking;

class UpdateBroadcastRequest extends JsonSerializableType
{
    /**
     * @var ?string $name Shown only to you.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?string $audienceId Send to this audience. `null` clears it.
     */
    #[JsonProperty('audience_id')]
    public ?string $audienceId;

    /**
     * @var ?string $segmentId Send to this segment. `null` clears it.
     */
    #[JsonProperty('segment_id')]
    public ?string $segmentId;

    /**
     * @var ?string $topic The topic it's about (its key). `null` clears it.
     */
    #[JsonProperty('topic')]
    public ?string $topic;

    /**
     * @var ?string $from
     */
    #[JsonProperty('from')]
    public ?string $from;

    /**
     * @var ?array<string> $replyTo Addresses replies go to.
     */
    #[JsonProperty('reply_to'), ArrayType(['string'])]
    public ?array $replyTo;

    /**
     * @var ?string $subject May use `{{{contact.<key>|fallback}}}` (e.g. `{{{contact.first_name|there}}}`).
     */
    #[JsonProperty('subject')]
    public ?string $subject;

    /**
     * @var ?string $previewText The inbox preview line. `null` removes it.
     */
    #[JsonProperty('preview_text')]
    public ?string $previewText;

    /**
     * @var ?string $html The HTML part. `null` removes it, if `text` remains.
     */
    #[JsonProperty('html')]
    public ?string $html;

    /**
     * @var ?string $text The plain text part. `null` removes it, if `html` remains.
     */
    #[JsonProperty('text')]
    public ?string $text;

    /**
     * @var ?UpdateBroadcastRequestTracking $tracking Which opens and clicks are tracked.
     */
    #[JsonProperty('tracking')]
    public ?UpdateBroadcastRequestTracking $tracking;

    /**
     * @var ?int $ratePerSecond Recipients per second. `null`: the plan's marketing rate.
     */
    #[JsonProperty('rate_per_second')]
    public ?int $ratePerSecond;

    /**
     * @param array{
     *   name?: ?string,
     *   audienceId?: ?string,
     *   segmentId?: ?string,
     *   topic?: ?string,
     *   from?: ?string,
     *   replyTo?: ?array<string>,
     *   subject?: ?string,
     *   previewText?: ?string,
     *   html?: ?string,
     *   text?: ?string,
     *   tracking?: ?UpdateBroadcastRequestTracking,
     *   ratePerSecond?: ?int,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
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
        $this->from = $values['from'] ?? null;
        if (array_key_exists('from', $values)) {
            $this->_setField('from');
        }
        $this->replyTo = $values['replyTo'] ?? null;
        if (array_key_exists('replyTo', $values)) {
            $this->_setField('replyTo');
        }
        $this->subject = $values['subject'] ?? null;
        if (array_key_exists('subject', $values)) {
            $this->_setField('subject');
        }
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
        $this->tracking = $values['tracking'] ?? null;
        if (array_key_exists('tracking', $values)) {
            $this->_setField('tracking');
        }
        $this->ratePerSecond = $values['ratePerSecond'] ?? null;
        if (array_key_exists('ratePerSecond', $values)) {
            $this->_setField('ratePerSecond');
        }
    }
}
