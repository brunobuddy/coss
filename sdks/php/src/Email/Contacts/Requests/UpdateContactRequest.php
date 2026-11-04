<?php

namespace Coss\Email\Contacts\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;
use Coss\Email\Contacts\Types\UpdateContactRequestStatus;
use Coss\Email\Contacts\Types\UpdateContactRequestTopicsItem;

class UpdateContactRequest extends JsonSerializableType
{
    /**
     * @var ?string $firstName Their first name. `null` removes it.
     */
    #[JsonProperty('first_name')]
    public ?string $firstName;

    /**
     * @var ?string $lastName Their last name. `null` removes it.
     */
    #[JsonProperty('last_name')]
    public ?string $lastName;

    /**
     * @var ?array<string, (
     *    string
     *   |float
     *   |bool
     * )|null> $properties Custom properties by key (define them first, see contact properties). Merged into the contact's existing properties; `null` removes one.
     */
    #[JsonProperty('properties'), ArrayType(['string' => new Union(new Union('string', 'float', 'bool'), 'null')])]
    public ?array $properties;

    /**
     * @var ?value-of<UpdateContactRequestStatus> $status Sets the contact's consent. Omitted, a new contact is `subscribed` and an existing one keeps its status.
     */
    #[JsonProperty('status')]
    public ?string $status;

    /**
     * @var ?array<UpdateContactRequestTopicsItem> $topics
     */
    #[JsonProperty('topics'), ArrayType([UpdateContactRequestTopicsItem::class])]
    public ?array $topics;

    /**
     * @param array{
     *   firstName?: ?string,
     *   lastName?: ?string,
     *   properties?: ?array<string, (
     *    string
     *   |float
     *   |bool
     * )|null>,
     *   status?: ?value-of<UpdateContactRequestStatus>,
     *   topics?: ?array<UpdateContactRequestTopicsItem>,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->firstName = $values['firstName'] ?? null;
        if (array_key_exists('firstName', $values)) {
            $this->_setField('firstName');
        }
        $this->lastName = $values['lastName'] ?? null;
        if (array_key_exists('lastName', $values)) {
            $this->_setField('lastName');
        }
        $this->properties = $values['properties'] ?? null;
        if (array_key_exists('properties', $values)) {
            $this->_setField('properties');
        }
        $this->status = $values['status'] ?? null;
        if (array_key_exists('status', $values)) {
            $this->_setField('status');
        }
        $this->topics = $values['topics'] ?? null;
        if (array_key_exists('topics', $values)) {
            $this->_setField('topics');
        }
    }
}
