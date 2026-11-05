<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class Topic extends JsonSerializableType
{
    /**
     * @var value-of<TopicObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $key The `category` of the emails about this topic. Can't change.
     */
    #[JsonProperty('key')]
    public string $key;

    /**
     * @var string $name Shown in the preference center.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var ?string $description Shown in the preference center under its name. `null`: none.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var value-of<TopicDefaultSubscription> $defaultSubscription `opt_in`: every subscribed contact gets the topic's emails unless they opt out. `opt_out`: only contacts who opted in do.
     */
    #[JsonProperty('default_subscription')]
    public string $defaultSubscription;

    /**
     * @var value-of<TopicVisibility> $visibility `private` topics never show in the preference center.
     */
    #[JsonProperty('visibility')]
    public string $visibility;

    /**
     * @var int $position Order in the preference center (ascending).
     */
    #[JsonProperty('position')]
    public int $position;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var DateTime $updatedAt
     */
    #[JsonProperty('updated_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $updatedAt;

    /**
     * @param array{
     *   object: value-of<TopicObject>,
     *   id: string,
     *   key: string,
     *   name: string,
     *   defaultSubscription: value-of<TopicDefaultSubscription>,
     *   visibility: value-of<TopicVisibility>,
     *   position: int,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   description?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->key = $values['key'];
        $this->name = $values['name'];
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->defaultSubscription = $values['defaultSubscription'];
        $this->visibility = $values['visibility'];
        $this->position = $values['position'];
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
