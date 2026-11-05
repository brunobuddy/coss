<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class ContactTopics extends JsonSerializableType
{
    /**
     * @var value-of<ContactTopicsObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $contactId The contact's id.
     */
    #[JsonProperty('contact_id')]
    public string $contactId;

    /**
     * @var array<ContactTopicsTopicsItem> $topics Every topic of the environment, with this contact's standing.
     */
    #[JsonProperty('topics'), ArrayType([ContactTopicsTopicsItem::class])]
    public array $topics;

    /**
     * @param array{
     *   object: value-of<ContactTopicsObject>,
     *   contactId: string,
     *   topics: array<ContactTopicsTopicsItem>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->contactId = $values['contactId'];
        $this->topics = $values['topics'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
