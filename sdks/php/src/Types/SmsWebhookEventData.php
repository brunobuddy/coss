<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class SmsWebhookEventData extends JsonSerializableType
{
    /**
     * @var ?SmsWebhookEventDataFailure $failure Why the message failed or wasn't delivered.
     */
    #[JsonProperty('failure')]
    public ?SmsWebhookEventDataFailure $failure;

    /**
     * @var ?string $providerErrorCode The provider's or carrier's own error code, e.g. `30007`.
     */
    #[JsonProperty('provider_error_code')]
    public ?string $providerErrorCode;

    /**
     * @var ?SmsWebhookEventDataSuppression $suppression `sms.suppressed`: the entry that made coss.com skip the number.
     */
    #[JsonProperty('suppression')]
    public ?SmsWebhookEventDataSuppression $suppression;

    /**
     * @var string $smsId The id of the message.
     */
    #[JsonProperty('sms_id')]
    public string $smsId;

    /**
     * @var string $from The number it's sent from.
     */
    #[JsonProperty('from')]
    public string $from;

    /**
     * @var string $to The recipient's number.
     */
    #[JsonProperty('to')]
    public string $to;

    /**
     * @var string $country The recipient's country (ISO 3166-1 alpha-2).
     */
    #[JsonProperty('country')]
    public string $country;

    /**
     * @var int $segments Segments the body takes (what is billed).
     */
    #[JsonProperty('segments')]
    public int $segments;

    /**
     * @var array<SmsWebhookEventDataTagsItem> $tags Your tags on the message.
     */
    #[JsonProperty('tags'), ArrayType([SmsWebhookEventDataTagsItem::class])]
    public array $tags;

    /**
     * @var bool $sandbox Whether it was sent from a sandbox environment: simulated.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var DateTime $occurredAt When it happened.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @var ?string $traceparent Only for a message sent with a W3C `traceparent` header: that trace context (normalized to version `00`), also sent as this request's `traceparent` header, so handling the event joins the sender's trace.
     */
    #[JsonProperty('traceparent')]
    public ?string $traceparent;

    /**
     * @param array{
     *   smsId: string,
     *   from: string,
     *   to: string,
     *   country: string,
     *   segments: int,
     *   tags: array<SmsWebhookEventDataTagsItem>,
     *   sandbox: bool,
     *   occurredAt: DateTime,
     *   failure?: ?SmsWebhookEventDataFailure,
     *   providerErrorCode?: ?string,
     *   suppression?: ?SmsWebhookEventDataSuppression,
     *   traceparent?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->failure = $values['failure'] ?? null;
        if (array_key_exists('failure', $values)) {
            $this->_setField('failure');
        }
        $this->providerErrorCode = $values['providerErrorCode'] ?? null;
        if (array_key_exists('providerErrorCode', $values)) {
            $this->_setField('providerErrorCode');
        }
        $this->suppression = $values['suppression'] ?? null;
        if (array_key_exists('suppression', $values)) {
            $this->_setField('suppression');
        }
        $this->smsId = $values['smsId'];
        $this->from = $values['from'];
        $this->to = $values['to'];
        $this->country = $values['country'];
        $this->segments = $values['segments'];
        $this->tags = $values['tags'];
        $this->sandbox = $values['sandbox'];
        $this->occurredAt = $values['occurredAt'];
        $this->traceparent = $values['traceparent'] ?? null;
        if (array_key_exists('traceparent', $values)) {
            $this->_setField('traceparent');
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
