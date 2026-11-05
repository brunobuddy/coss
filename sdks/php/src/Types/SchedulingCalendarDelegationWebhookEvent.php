<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class SchedulingCalendarDelegationWebhookEvent extends JsonSerializableType
{
    /**
     * @var string $id The event id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<SchedulingCalendarDelegationWebhookEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $apiVersion The API version this payload is rendered in: the endpoint's.
     */
    #[JsonProperty('api_version')]
    public string $apiVersion;

    /**
     * @var DateTime $createdAt When the event was created.
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var value-of<SchedulingCalendarDelegationWebhookEventType> $type
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var SchedulingCalendarDelegationWebhookEventData $data
     */
    #[JsonProperty('data')]
    public SchedulingCalendarDelegationWebhookEventData $data;

    /**
     * @param array{
     *   id: string,
     *   object: value-of<SchedulingCalendarDelegationWebhookEventObject>,
     *   apiVersion: string,
     *   createdAt: DateTime,
     *   type: value-of<SchedulingCalendarDelegationWebhookEventType>,
     *   data: SchedulingCalendarDelegationWebhookEventData,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->object = $values['object'];
        $this->apiVersion = $values['apiVersion'];
        $this->createdAt = $values['createdAt'];
        $this->type = $values['type'];
        $this->data = $values['data'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
