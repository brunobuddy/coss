<?php

namespace Coss\Forms\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * Turning submissions into contacts. Only the fields given change.
 */
class CreateFormRequestContacts extends JsonSerializableType
{
    /**
     * @var ?bool $enabled Turn each accepted submission into a contact, from `submitter.email_field`. Default false.
     */
    #[JsonProperty('enabled')]
    public ?bool $enabled;

    /**
     * @var ?array<string> $audienceIds Audiences the contact joins. They must exist in this environment.
     */
    #[JsonProperty('audience_ids'), ArrayType(['string'])]
    public ?array $audienceIds;

    /**
     * @var ?array<string> $topics Topic keys the contact is opted into.
     */
    #[JsonProperty('topics'), ArrayType(['string'])]
    public ?array $topics;

    /**
     * @var ?bool $doubleOptIn New contacts confirm their subscription by email first. `null` (default): the environment's marketing settings decide.
     */
    #[JsonProperty('double_opt_in')]
    public ?bool $doubleOptIn;

    /**
     * @var ?string $firstNameField The field holding the contact's first name. `null`: none.
     */
    #[JsonProperty('first_name_field')]
    public ?string $firstNameField;

    /**
     * @var ?string $lastNameField The field holding the contact's last name. `null`: none.
     */
    #[JsonProperty('last_name_field')]
    public ?string $lastNameField;

    /**
     * @var ?array<string, string> $properties Contact property key → the field whose value it takes.
     */
    #[JsonProperty('properties'), ArrayType(['string' => 'string'])]
    public ?array $properties;

    /**
     * @param array{
     *   enabled?: ?bool,
     *   audienceIds?: ?array<string>,
     *   topics?: ?array<string>,
     *   doubleOptIn?: ?bool,
     *   firstNameField?: ?string,
     *   lastNameField?: ?string,
     *   properties?: ?array<string, string>,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->enabled = $values['enabled'] ?? null;
        if (array_key_exists('enabled', $values)) {
            $this->_setField('enabled');
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
        $this->firstNameField = $values['firstNameField'] ?? null;
        if (array_key_exists('firstNameField', $values)) {
            $this->_setField('firstNameField');
        }
        $this->lastNameField = $values['lastNameField'] ?? null;
        if (array_key_exists('lastNameField', $values)) {
            $this->_setField('lastNameField');
        }
        $this->properties = $values['properties'] ?? null;
        if (array_key_exists('properties', $values)) {
            $this->_setField('properties');
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
