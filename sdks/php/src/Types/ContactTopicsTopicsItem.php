<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class ContactTopicsTopicsItem extends JsonSerializableType
{
    /**
     * @var string $topic The topic's key.
     */
    #[JsonProperty('topic')]
    public string $topic;

    /**
     * @var string $name The topic's name.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var bool $subscribed Whether emails about the topic reach the contact (its choice, else the topic's default; an unsubscribed contact gets no marketing email at all).
     */
    #[JsonProperty('subscribed')]
    public bool $subscribed;

    /**
     * @var ?value-of<ContactTopicsTopicsItemChoice> $choice The contact's explicit choice; `null`: the topic's default applies.
     */
    #[JsonProperty('choice')]
    public ?string $choice;

    /**
     * @param array{
     *   topic: string,
     *   name: string,
     *   subscribed: bool,
     *   choice?: ?value-of<ContactTopicsTopicsItemChoice>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->topic = $values['topic'];
        $this->name = $values['name'];
        $this->subscribed = $values['subscribed'];
        $this->choice = $values['choice'] ?? null;
        if (array_key_exists('choice', $values)) {
            $this->_setField('choice');
        }
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
