<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class WebhookListener extends JsonSerializableType
{
    /**
     * @var value-of<WebhookListenerObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $apiVersion The API version (`Coss-Version`) the listener's events are rendered in.
     */
    #[JsonProperty('api_version')]
    public string $apiVersion;

    /**
     * @var array<string> $eventTypes Event types the listener receives. An empty array means every event type.
     */
    #[JsonProperty('event_types'), ArrayType(['string'])]
    public array $eventTypes;

    /**
     * @var ?string $description Your note about it, such as the machine it's on. `null`: none.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var DateTime $expiresAt When the listener closes unless it is polled again; every poll moves it 10 minutes ahead.
     */
    #[JsonProperty('expires_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $expiresAt;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<WebhookListenerObject>,
     *   id: string,
     *   apiVersion: string,
     *   eventTypes: array<string>,
     *   expiresAt: DateTime,
     *   createdAt: DateTime,
     *   description?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->apiVersion = $values['apiVersion'];
        $this->eventTypes = $values['eventTypes'];
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->expiresAt = $values['expiresAt'];
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
