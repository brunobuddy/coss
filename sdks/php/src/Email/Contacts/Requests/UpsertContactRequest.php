<?php

namespace Coss\Email\Contacts\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;
use Coss\Email\Contacts\Types\UpsertContactRequestStatus;
use Coss\Email\Contacts\Types\UpsertContactRequestTopicsItem;

class UpsertContactRequest extends JsonSerializableType
{
    /**
     * @var string $email The contact's address. Display names are ignored; matching is case-insensitive.
     */
    #[JsonProperty('email')]
    public string $email;

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
     * @var ?value-of<UpsertContactRequestStatus> $status Sets the contact's consent. Omitted, a new contact is `subscribed` and an existing one keeps its status.
     */
    #[JsonProperty('status')]
    public ?string $status;

    /**
     * @var ?array<string> $audienceIds Audiences to add the contact to (it stays in the others).
     */
    #[JsonProperty('audience_ids'), ArrayType(['string'])]
    public ?array $audienceIds;

    /**
     * @var ?array<UpsertContactRequestTopicsItem> $topics Choices per topic; topics left out keep the contact's choice.
     */
    #[JsonProperty('topics'), ArrayType([UpsertContactRequestTopicsItem::class])]
    public ?array $topics;

    /**
     * @var ?bool $doubleOptIn Ask the contact to confirm first (default: the marketing settings' `double_opt_in_default`): a new or unsubscribed contact becomes `pending` and gets a confirmation email; it is `subscribed` once they click its link. Can't be combined with `status: "subscribed"`, nor can the default (pass `false` to subscribe directly).
     */
    #[JsonProperty('double_opt_in')]
    public ?bool $doubleOptIn;

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
     *   status?: ?value-of<UpsertContactRequestStatus>,
     *   audienceIds?: ?array<string>,
     *   topics?: ?array<UpsertContactRequestTopicsItem>,
     *   doubleOptIn?: ?bool,
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
        $this->audienceIds = $values['audienceIds'] ?? null;
        if (array_key_exists('audienceIds', $values)) {
            $this->_setField('audienceIds');
        }
        $this->topics = $values['topics'] ?? null;
        if (array_key_exists('topics', $values)) {
            $this->_setField('topics');
        }
        $this->doubleOptIn = $values['doubleOptIn'] ?? null;
        if (array_key_exists('doubleOptIn', $values)) {
            $this->_setField('doubleOptIn');
        }
    }
}
