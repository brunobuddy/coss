<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class FormSubmissionWebhookEvent extends JsonSerializableType
{
    /**
     * @var string $id The event id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<FormSubmissionWebhookEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var value-of<FormSubmissionWebhookEventType> $type `received`: a submission was accepted (at once, after the submitter confirmed, or released from review). `flagged`: Risk held it for review or refused it (honeypot catches send nothing).
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
     * @var FormSubmissionWebhookEventData $data The submission.
     */
    #[JsonProperty('data')]
    public FormSubmissionWebhookEventData $data;

    /**
     * @param array{
     *   id: string,
     *   object: value-of<FormSubmissionWebhookEventObject>,
     *   type: value-of<FormSubmissionWebhookEventType>,
     *   apiVersion: string,
     *   createdAt: DateTime,
     *   data: FormSubmissionWebhookEventData,
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
