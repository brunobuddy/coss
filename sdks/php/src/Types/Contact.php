<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;
use DateTime;
use Coss\Core\Types\Date;

class Contact extends JsonSerializableType
{
    /**
     * @var value-of<ContactObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $email The contact's address. Unique in the environment, case-insensitively.
     */
    #[JsonProperty('email')]
    public string $email;

    /**
     * @var ?string $firstName Their first name. `null`: not set.
     */
    #[JsonProperty('first_name')]
    public ?string $firstName;

    /**
     * @var ?string $lastName Their last name. `null`: not set.
     */
    #[JsonProperty('last_name')]
    public ?string $lastName;

    /**
     * @var value-of<ContactStatus> $status Consent to marketing email: `subscribed`, `unsubscribed` (never receives marketing email; transactional email is unaffected) or `pending` (waiting for a double opt-in confirmation).
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var array<string, (
     *    string
     *   |float
     *   |bool
     * )> $properties Custom properties by key.
     */
    #[JsonProperty('properties'), ArrayType(['string' => new Union('string', 'float', 'bool')])]
    public array $properties;

    /**
     * @var value-of<ContactSource> $source How the contact was created.
     */
    #[JsonProperty('source')]
    public string $source;

    /**
     * @var ?DateTime $subscribedAt When it last became `subscribed`. `null`: it hasn't.
     */
    #[JsonProperty('subscribed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $subscribedAt;

    /**
     * @var ?DateTime $unsubscribedAt When it became `unsubscribed`. `null` unless it is.
     */
    #[JsonProperty('unsubscribed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $unsubscribedAt;

    /**
     * @var ?DateTime $confirmedAt When the contact confirmed a double opt-in.
     */
    #[JsonProperty('confirmed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $confirmedAt;

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
     *   object: value-of<ContactObject>,
     *   id: string,
     *   email: string,
     *   status: value-of<ContactStatus>,
     *   properties: array<string, (
     *    string
     *   |float
     *   |bool
     * )>,
     *   source: value-of<ContactSource>,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   firstName?: ?string,
     *   lastName?: ?string,
     *   subscribedAt?: ?DateTime,
     *   unsubscribedAt?: ?DateTime,
     *   confirmedAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->email = $values['email'];
        $this->firstName = $values['firstName'] ?? null;
        if (array_key_exists('firstName', $values)) {
            $this->_setField('firstName');
        }
        $this->lastName = $values['lastName'] ?? null;
        if (array_key_exists('lastName', $values)) {
            $this->_setField('lastName');
        }
        $this->status = $values['status'];
        $this->properties = $values['properties'];
        $this->source = $values['source'];
        $this->subscribedAt = $values['subscribedAt'] ?? null;
        if (array_key_exists('subscribedAt', $values)) {
            $this->_setField('subscribedAt');
        }
        $this->unsubscribedAt = $values['unsubscribedAt'] ?? null;
        if (array_key_exists('unsubscribedAt', $values)) {
            $this->_setField('unsubscribedAt');
        }
        $this->confirmedAt = $values['confirmedAt'] ?? null;
        if (array_key_exists('confirmedAt', $values)) {
            $this->_setField('confirmedAt');
        }
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
