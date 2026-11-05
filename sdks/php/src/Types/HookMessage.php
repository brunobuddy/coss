<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class HookMessage extends JsonSerializableType
{
    /**
     * @var value-of<HookMessageObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id Also the `webhook-id` header of every request delivering it.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $applicationId The id of the application it was sent to.
     */
    #[JsonProperty('application_id')]
    public string $applicationId;

    /**
     * @var string $eventType The event type it was sent as.
     */
    #[JsonProperty('event_type')]
    public string $eventType;

    /**
     * @var array<string, mixed> $payload The JSON body delivered to each endpoint.
     */
    #[JsonProperty('payload'), ArrayType(['string' => 'mixed'])]
    public array $payload;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<HookMessageObject>,
     *   id: string,
     *   applicationId: string,
     *   eventType: string,
     *   payload: array<string, mixed>,
     *   createdAt: DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->applicationId = $values['applicationId'];
        $this->eventType = $values['eventType'];
        $this->payload = $values['payload'];
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
