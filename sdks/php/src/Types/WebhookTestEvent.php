<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\Union;

class WebhookTestEvent extends JsonSerializableType
{
    /**
     * @var value-of<WebhookTestEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var (
     *    EmailWebhookEvent
     *   |ReceivedEmailWebhookEvent
     *   |HookEndpointWebhookEvent
     *   |RiskWebhookEvent
     *   |ContactWebhookEvent
     *   |BroadcastWebhookEvent
     *   |InboxMessageReceivedWebhookEvent
     *   |SmsWebhookEvent
     *   |ReceivedSmsWebhookEvent
     *   |SignRequestWebhookEvent
     *   |VerificationWebhookEvent
     *   |FormSubmissionWebhookEvent
     *   |SchedulingBookingWebhookEvent
     *   |SchedulingCalendarWebhookEvent
     *   |SchedulingCalendarDelegationWebhookEvent
     * ) $event The event, as an endpoint on the request's API version receives it. Its `webhook-id` header is `event.id`.
     */
    #[JsonProperty('event'), Union(EmailWebhookEvent::class, ReceivedEmailWebhookEvent::class, HookEndpointWebhookEvent::class, RiskWebhookEvent::class, ContactWebhookEvent::class, BroadcastWebhookEvent::class, InboxMessageReceivedWebhookEvent::class, SmsWebhookEvent::class, ReceivedSmsWebhookEvent::class, SignRequestWebhookEvent::class, VerificationWebhookEvent::class, FormSubmissionWebhookEvent::class, SchedulingBookingWebhookEvent::class, SchedulingCalendarWebhookEvent::class, SchedulingCalendarDelegationWebhookEvent::class)]
    public EmailWebhookEvent|ReceivedEmailWebhookEvent|HookEndpointWebhookEvent|RiskWebhookEvent|ContactWebhookEvent|BroadcastWebhookEvent|InboxMessageReceivedWebhookEvent|SmsWebhookEvent|ReceivedSmsWebhookEvent|SignRequestWebhookEvent|VerificationWebhookEvent|FormSubmissionWebhookEvent|SchedulingBookingWebhookEvent|SchedulingCalendarWebhookEvent|SchedulingCalendarDelegationWebhookEvent $event;

    /**
     * @var int $endpoints Enabled endpoints of the environment subscribed to the type, each sent it once.
     */
    #[JsonProperty('endpoints')]
    public int $endpoints;

    /**
     * @var int $listeners Open `coss listen` listeners subscribed to the type, each handed it once.
     */
    #[JsonProperty('listeners')]
    public int $listeners;

    /**
     * @param array{
     *   object: value-of<WebhookTestEventObject>,
     *   event: (
     *    EmailWebhookEvent
     *   |ReceivedEmailWebhookEvent
     *   |HookEndpointWebhookEvent
     *   |RiskWebhookEvent
     *   |ContactWebhookEvent
     *   |BroadcastWebhookEvent
     *   |InboxMessageReceivedWebhookEvent
     *   |SmsWebhookEvent
     *   |ReceivedSmsWebhookEvent
     *   |SignRequestWebhookEvent
     *   |VerificationWebhookEvent
     *   |FormSubmissionWebhookEvent
     *   |SchedulingBookingWebhookEvent
     *   |SchedulingCalendarWebhookEvent
     *   |SchedulingCalendarDelegationWebhookEvent
     * ),
     *   endpoints: int,
     *   listeners: int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->event = $values['event'];
        $this->endpoints = $values['endpoints'];
        $this->listeners = $values['listeners'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
