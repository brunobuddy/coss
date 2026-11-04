<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class VerificationWebhookEvent extends JsonSerializableType
{
    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<VerificationWebhookEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var value-of<VerificationWebhookEventType> $type What happened to the verification.
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
     * @var VerificationWebhookEventData $data The verification. Never its code.
     */
    #[JsonProperty('data')]
    public VerificationWebhookEventData $data;

    /**
     * @param array{
     *   id: string,
     *   object: value-of<VerificationWebhookEventObject>,
     *   type: value-of<VerificationWebhookEventType>,
     *   apiVersion: string,
     *   createdAt: DateTime,
     *   data: VerificationWebhookEventData,
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
