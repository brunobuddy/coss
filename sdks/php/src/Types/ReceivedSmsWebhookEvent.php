<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class ReceivedSmsWebhookEvent extends JsonSerializableType
{
    /**
     * @var string $id The event id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<ReceivedSmsWebhookEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var value-of<ReceivedSmsWebhookEventType> $type `sms.received`: a message arrived. `sms.opted_out`: the sender replied with an opt-out keyword. `sms.opted_in`: the sender replied with an opt-in keyword.
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
     * @var ReceivedSmsWebhookEventData $data
     */
    #[JsonProperty('data')]
    public ReceivedSmsWebhookEventData $data;

    /**
     * @param array{
     *   id: string,
     *   object: value-of<ReceivedSmsWebhookEventObject>,
     *   type: value-of<ReceivedSmsWebhookEventType>,
     *   apiVersion: string,
     *   createdAt: DateTime,
     *   data: ReceivedSmsWebhookEventData,
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
