<?php

namespace Coss\Email\Contacts\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class UpsertContactRequestTopicsItem extends JsonSerializableType
{
    /**
     * @var string $topic The topic's key.
     */
    #[JsonProperty('topic')]
    public string $topic;

    /**
     * @var value-of<UpsertContactRequestTopicsItemStatus> $status `opted_in` or `opted_out` of the topic.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @param array{
     *   topic: string,
     *   status: value-of<UpsertContactRequestTopicsItemStatus>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->topic = $values['topic'];
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
