<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class Sms extends JsonSerializableType
{
    /**
     * @var value-of<SmsObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $from The number it's sent from, in E.164.
     */
    #[JsonProperty('from')]
    public string $from;

    /**
     * @var string $to The recipient's number, in E.164.
     */
    #[JsonProperty('to')]
    public string $to;

    /**
     * @var string $body The text. Empty once discarded.
     */
    #[JsonProperty('body')]
    public string $body;

    /**
     * @var value-of<SmsStatus> $status `queued` until handed to the carrier (`sent`), then `delivered` or `undelivered` once the carrier reports. `failed`: never sent. `scheduled` and `canceled`: scheduled sends.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var int $segments Segments the body takes (what is billed).
     */
    #[JsonProperty('segments')]
    public int $segments;

    /**
     * @var value-of<SmsEncoding> $encoding `gsm7` fits the basic alphabet; `ucs2` is used for anything else, with smaller segments.
     */
    #[JsonProperty('encoding')]
    public string $encoding;

    /**
     * @var string $country ISO 3166 country of `to`.
     */
    #[JsonProperty('country')]
    public string $country;

    /**
     * @var array<SmsTagsItem> $tags Your tags on the message.
     */
    #[JsonProperty('tags'), ArrayType([SmsTagsItem::class])]
    public array $tags;

    /**
     * @var ?SmsFailure $failure Why the message failed or wasn't delivered.
     */
    #[JsonProperty('failure')]
    public ?SmsFailure $failure;

    /**
     * @var bool $sandbox Sent from a sandbox environment: simulated.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var ?DateTime $scheduledAt When it's set to send. `null`: it was sent at once.
     */
    #[JsonProperty('scheduled_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $scheduledAt;

    /**
     * @var ?DateTime $sentAt When it was handed to the carrier. `null`: not yet.
     */
    #[JsonProperty('sent_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $sentAt;

    /**
     * @var ?DateTime $deliveredAt When the carrier reported delivery. `null`: not delivered, or not reported.
     */
    #[JsonProperty('delivered_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $deliveredAt;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<SmsObject>,
     *   id: string,
     *   from: string,
     *   to: string,
     *   body: string,
     *   status: value-of<SmsStatus>,
     *   segments: int,
     *   encoding: value-of<SmsEncoding>,
     *   country: string,
     *   tags: array<SmsTagsItem>,
     *   sandbox: bool,
     *   createdAt: DateTime,
     *   failure?: ?SmsFailure,
     *   scheduledAt?: ?DateTime,
     *   sentAt?: ?DateTime,
     *   deliveredAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->from = $values['from'];
        $this->to = $values['to'];
        $this->body = $values['body'];
        $this->status = $values['status'];
        $this->segments = $values['segments'];
        $this->encoding = $values['encoding'];
        $this->country = $values['country'];
        $this->tags = $values['tags'];
        $this->failure = $values['failure'] ?? null;
        if (array_key_exists('failure', $values)) {
            $this->_setField('failure');
        }
        $this->sandbox = $values['sandbox'];
        $this->scheduledAt = $values['scheduledAt'] ?? null;
        if (array_key_exists('scheduledAt', $values)) {
            $this->_setField('scheduledAt');
        }
        $this->sentAt = $values['sentAt'] ?? null;
        if (array_key_exists('sentAt', $values)) {
            $this->_setField('sentAt');
        }
        $this->deliveredAt = $values['deliveredAt'] ?? null;
        if (array_key_exists('deliveredAt', $values)) {
            $this->_setField('deliveredAt');
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
