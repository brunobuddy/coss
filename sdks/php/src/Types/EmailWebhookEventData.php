<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class EmailWebhookEventData extends JsonSerializableType
{
    /**
     * @var ?EmailWebhookEventDataBounce $bounce
     */
    #[JsonProperty('bounce')]
    public ?EmailWebhookEventDataBounce $bounce;

    /**
     * @var ?EmailWebhookEventDataComplaint $complaint
     */
    #[JsonProperty('complaint')]
    public ?EmailWebhookEventDataComplaint $complaint;

    /**
     * @var ?EmailWebhookEventDataDelay $delay
     */
    #[JsonProperty('delay')]
    public ?EmailWebhookEventDataDelay $delay;

    /**
     * @var ?EmailWebhookEventDataDelivery $delivery
     */
    #[JsonProperty('delivery')]
    public ?EmailWebhookEventDataDelivery $delivery;

    /**
     * @var ?EmailWebhookEventDataFailure $failure
     */
    #[JsonProperty('failure')]
    public ?EmailWebhookEventDataFailure $failure;

    /**
     * @var ?EmailWebhookEventDataSuppression $suppression Only for `email.suppressed`: the entry that matched the recipient.
     */
    #[JsonProperty('suppression')]
    public ?EmailWebhookEventDataSuppression $suppression;

    /**
     * @var ?EmailWebhookEventDataUnsubscribe $unsubscribe Only for `email.suppressed` without `suppression`: the recipient is a contact who unsubscribed (from marketing, or from the email's topic, `topic`).
     */
    #[JsonProperty('unsubscribe')]
    public ?EmailWebhookEventDataUnsubscribe $unsubscribe;

    /**
     * @var ?EmailWebhookEventDataOpen $open Only for `email.opened`.
     */
    #[JsonProperty('open')]
    public ?EmailWebhookEventDataOpen $open;

    /**
     * @var ?EmailWebhookEventDataClick $click Only for `email.clicked`.
     */
    #[JsonProperty('click')]
    public ?EmailWebhookEventDataClick $click;

    /**
     * @var ?EmailWebhookEventDataReschedule $reschedule Only for `email.rescheduled`.
     */
    #[JsonProperty('reschedule')]
    public ?EmailWebhookEventDataReschedule $reschedule;

    /**
     * @var string $emailId
     */
    #[JsonProperty('email_id')]
    public string $emailId;

    /**
     * @var string $from
     */
    #[JsonProperty('from')]
    public string $from;

    /**
     * @var array<string> $to
     */
    #[JsonProperty('to'), ArrayType(['string'])]
    public array $to;

    /**
     * @var string $subject
     */
    #[JsonProperty('subject')]
    public string $subject;

    /**
     * @var array<EmailWebhookEventDataTagsItem> $tags
     */
    #[JsonProperty('tags'), ArrayType([EmailWebhookEventDataTagsItem::class])]
    public array $tags;

    /**
     * @var ?string $category
     */
    #[JsonProperty('category')]
    public ?string $category;

    /**
     * @var bool $sandbox
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var ?string $recipient
     */
    #[JsonProperty('recipient')]
    public ?string $recipient;

    /**
     * @var DateTime $occurredAt
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @var ?string $subaccountId Only for an email sent for a sub-account: its id.
     */
    #[JsonProperty('subaccount_id')]
    public ?string $subaccountId;

    /**
     * @var ?string $traceparent Only for an email sent with a W3C `traceparent` header: that trace context (normalized to version `00`), also sent as this request's `traceparent` header, so handling the event joins the sender's trace.
     */
    #[JsonProperty('traceparent')]
    public ?string $traceparent;

    /**
     * @param array{
     *   emailId: string,
     *   from: string,
     *   to: array<string>,
     *   subject: string,
     *   tags: array<EmailWebhookEventDataTagsItem>,
     *   sandbox: bool,
     *   occurredAt: DateTime,
     *   bounce?: ?EmailWebhookEventDataBounce,
     *   complaint?: ?EmailWebhookEventDataComplaint,
     *   delay?: ?EmailWebhookEventDataDelay,
     *   delivery?: ?EmailWebhookEventDataDelivery,
     *   failure?: ?EmailWebhookEventDataFailure,
     *   suppression?: ?EmailWebhookEventDataSuppression,
     *   unsubscribe?: ?EmailWebhookEventDataUnsubscribe,
     *   open?: ?EmailWebhookEventDataOpen,
     *   click?: ?EmailWebhookEventDataClick,
     *   reschedule?: ?EmailWebhookEventDataReschedule,
     *   category?: ?string,
     *   recipient?: ?string,
     *   subaccountId?: ?string,
     *   traceparent?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->bounce = $values['bounce'] ?? null;
        if (array_key_exists('bounce', $values)) {
            $this->_setField('bounce');
        }
        $this->complaint = $values['complaint'] ?? null;
        if (array_key_exists('complaint', $values)) {
            $this->_setField('complaint');
        }
        $this->delay = $values['delay'] ?? null;
        if (array_key_exists('delay', $values)) {
            $this->_setField('delay');
        }
        $this->delivery = $values['delivery'] ?? null;
        if (array_key_exists('delivery', $values)) {
            $this->_setField('delivery');
        }
        $this->failure = $values['failure'] ?? null;
        if (array_key_exists('failure', $values)) {
            $this->_setField('failure');
        }
        $this->suppression = $values['suppression'] ?? null;
        if (array_key_exists('suppression', $values)) {
            $this->_setField('suppression');
        }
        $this->unsubscribe = $values['unsubscribe'] ?? null;
        if (array_key_exists('unsubscribe', $values)) {
            $this->_setField('unsubscribe');
        }
        $this->open = $values['open'] ?? null;
        if (array_key_exists('open', $values)) {
            $this->_setField('open');
        }
        $this->click = $values['click'] ?? null;
        if (array_key_exists('click', $values)) {
            $this->_setField('click');
        }
        $this->reschedule = $values['reschedule'] ?? null;
        if (array_key_exists('reschedule', $values)) {
            $this->_setField('reschedule');
        }
        $this->emailId = $values['emailId'];
        $this->from = $values['from'];
        $this->to = $values['to'];
        $this->subject = $values['subject'];
        $this->tags = $values['tags'];
        $this->category = $values['category'] ?? null;
        if (array_key_exists('category', $values)) {
            $this->_setField('category');
        }
        $this->sandbox = $values['sandbox'];
        $this->recipient = $values['recipient'] ?? null;
        if (array_key_exists('recipient', $values)) {
            $this->_setField('recipient');
        }
        $this->occurredAt = $values['occurredAt'];
        $this->subaccountId = $values['subaccountId'] ?? null;
        if (array_key_exists('subaccountId', $values)) {
            $this->_setField('subaccountId');
        }
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
