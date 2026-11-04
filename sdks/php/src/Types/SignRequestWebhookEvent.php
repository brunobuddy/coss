<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class SignRequestWebhookEvent extends JsonSerializableType
{
    /**
     * @var string $id The event id: the same as the audit trail's `SignEvent.id`.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<SignRequestWebhookEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var value-of<SignRequestWebhookEventType> $type `sent`: sent to signers. `viewed`: a signer opened it. `signer_signed`: a signer signed. `declined`: a signer declined. `completed`: the sealed document is ready to download. `canceled` and `expired`: it ended unsigned.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var string $apiVersion The API version the payload is rendered in (your endpoint's version).
     */
    #[JsonProperty('api_version')]
    public string $apiVersion;

    /**
     * @var DateTime $createdAt When the event was created.
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var SignRequestWebhookEventData $data The request. Never documents or field values.
     */
    #[JsonProperty('data')]
    public SignRequestWebhookEventData $data;

    /**
     * @param array{
     *   id: string,
     *   object: value-of<SignRequestWebhookEventObject>,
     *   type: value-of<SignRequestWebhookEventType>,
     *   apiVersion: string,
     *   createdAt: DateTime,
     *   data: SignRequestWebhookEventData,
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
