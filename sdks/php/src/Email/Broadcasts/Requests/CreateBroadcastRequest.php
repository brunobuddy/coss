<?php

namespace Coss\Email\Broadcasts\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Email\Broadcasts\Types\CreateBroadcastRequestTracking;
use DateTime;
use Coss\Core\Types\Date;

class CreateBroadcastRequest extends JsonSerializableType
{
    /**
     * @var ?string $idempotencyKey Makes retries safe: a repeated request with the same key and body returns the broadcast created first instead of creating another, for 24 hours. 1-256 characters.
     */
    public ?string $idempotencyKey;

    /**
     * @var string $name Shown only to you.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var ?string $audienceId Send to this audience…
     */
    #[JsonProperty('audience_id')]
    public ?string $audienceId;

    /**
     * @var ?string $segmentId …or to this segment (one of the two).
     */
    #[JsonProperty('segment_id')]
    public ?string $segmentId;

    /**
     * @var ?string $topic The topic the broadcast is about (its key): only contacts it reaches get it, and its unsubscribe link leaves just that topic. It is the emails' `category`.
     */
    #[JsonProperty('topic')]
    public ?string $topic;

    /**
     * @var string $from
     */
    #[JsonProperty('from')]
    public string $from;

    /**
     * @var ?array<string> $replyTo Addresses replies go to.
     */
    #[JsonProperty('reply_to'), ArrayType(['string'])]
    public ?array $replyTo;

    /**
     * @var string $subject May use `{{{contact.<key>|fallback}}}` (e.g. `{{{contact.first_name|there}}}`).
     */
    #[JsonProperty('subject')]
    public string $subject;

    /**
     * @var ?string $previewText The inbox preview line (a hidden preheader at the start of the HTML).
     */
    #[JsonProperty('preview_text')]
    public ?string $previewText;

    /**
     * @var ?string $html `{{{contact.<key>|fallback}}}` for contact fields and properties (escaped), and `{{{unsubscribe_url}}}`, `{{{preferences_url}}}`, `{{{mailing_address}}}`; a footer with the postal address and an unsubscribe link is added unless they are there.
     */
    #[JsonProperty('html')]
    public ?string $html;

    /**
     * @var ?string $text The plain text part. Takes the same placeholders as `html`.
     */
    #[JsonProperty('text')]
    public ?string $text;

    /**
     * @var ?CreateBroadcastRequestTracking $tracking Which opens and clicks are tracked.
     */
    #[JsonProperty('tracking')]
    public ?CreateBroadcastRequestTracking $tracking;

    /**
     * @var ?int $ratePerSecond Recipients per second, at most the plan's marketing rate (the default).
     */
    #[JsonProperty('rate_per_second')]
    public ?int $ratePerSecond;

    /**
     * @var ?bool $send Start sending right away.
     */
    #[JsonProperty('send')]
    public ?bool $send;

    /**
     * @var ?DateTime $scheduledAt Start sending at this time (ISO 8601 with an offset, at most 30 days ahead).
     */
    #[JsonProperty('scheduled_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $scheduledAt;

    /**
     * @param array{
     *   name: string,
     *   from: string,
     *   subject: string,
     *   idempotencyKey?: ?string,
     *   audienceId?: ?string,
     *   segmentId?: ?string,
     *   topic?: ?string,
     *   replyTo?: ?array<string>,
     *   previewText?: ?string,
     *   html?: ?string,
     *   text?: ?string,
     *   tracking?: ?CreateBroadcastRequestTracking,
     *   ratePerSecond?: ?int,
     *   send?: ?bool,
     *   scheduledAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->idempotencyKey = $values['idempotencyKey'] ?? null;
        if (array_key_exists('idempotencyKey', $values)) {
            $this->_setField('idempotencyKey');
        }
        $this->name = $values['name'];
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
        $this->replyTo = $values['replyTo'] ?? null;
        if (array_key_exists('replyTo', $values)) {
            $this->_setField('replyTo');
        }
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
        $this->tracking = $values['tracking'] ?? null;
        if (array_key_exists('tracking', $values)) {
            $this->_setField('tracking');
        }
        $this->ratePerSecond = $values['ratePerSecond'] ?? null;
        if (array_key_exists('ratePerSecond', $values)) {
            $this->_setField('ratePerSecond');
        }
        $this->send = $values['send'] ?? null;
        if (array_key_exists('send', $values)) {
            $this->_setField('send');
        }
        $this->scheduledAt = $values['scheduledAt'] ?? null;
        if (array_key_exists('scheduledAt', $values)) {
            $this->_setField('scheduledAt');
        }
    }
}
