<?php

namespace Coss\Email\Contacts\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;

class ImportContactsRequestContactsItem extends JsonSerializableType
{
    /**
     * @var string $email The contact's address (validated on its own).
     */
    #[JsonProperty('email')]
    public string $email;

    /**
     * @var ?string $firstName Their first name.
     */
    #[JsonProperty('first_name')]
    public ?string $firstName;

    /**
     * @var ?string $lastName Their last name.
     */
    #[JsonProperty('last_name')]
    public ?string $lastName;

    /**
     * @var ?array<string, (
     *    string
     *   |float
     *   |bool
     * )|null> $properties Custom properties by key, checked against their definitions.
     */
    #[JsonProperty('properties'), ArrayType(['string' => new Union(new Union('string', 'float', 'bool'), 'null')])]
    public ?array $properties;

    /**
     * @var ?string $status `subscribed` or `unsubscribed` (anything else, like an export's `pending`, is reported in `invalid`). Omitted, a new contact is `subscribed` and an existing one keeps its status.
     */
    #[JsonProperty('status')]
    public ?string $status;

    /**
     * @param array{
     *   email: string,
     *   firstName?: ?string,
     *   lastName?: ?string,
     *   properties?: ?array<string, (
     *    string
     *   |float
     *   |bool
     * )|null>,
     *   status?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->email = $values['email'];
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
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
