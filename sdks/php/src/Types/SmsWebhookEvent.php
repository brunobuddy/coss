<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class SmsWebhookEvent extends JsonSerializableType
{
    /**
     * @var string $id The event id: the same as `SmsEvent.id`.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<SmsWebhookEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var value-of<SmsWebhookEventType> $type What happened to the message.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var string $apiVersion The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.
     */
    #[JsonProperty('api_version')]
    public string $apiVersion;

    /**
     * @var DateTime $createdAt When the event was created.
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var SmsWebhookEventData $data
     */
    #[JsonProperty('data')]
    public SmsWebhookEventData $data;

    /**
     * @param array{
     *   id: string,
     *   object: value-of<SmsWebhookEventObject>,
     *   type: value-of<SmsWebhookEventType>,
     *   apiVersion: string,
     *   createdAt: DateTime,
     *   data: SmsWebhookEventData,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->object = $values['object'];
        $this->type = $values['type'];
        $this->apiVersion = $values['apiVersion'];
        $this->createdAt = $values['createdAt'];
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
