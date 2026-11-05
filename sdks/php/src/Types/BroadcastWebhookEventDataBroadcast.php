<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class BroadcastWebhookEventDataBroadcast extends JsonSerializableType
{
    /**
     * @var string $id The broadcast's id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name Its name.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var value-of<BroadcastWebhookEventDataBroadcastStatus> $status Its status after this event.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @param array{
     *   id: string,
     *   name: string,
     *   status: value-of<BroadcastWebhookEventDataBroadcastStatus>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->status = $values['status'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
