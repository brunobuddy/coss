<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Resource limits (`null`: unlimited).
 */
class BillingLimits extends JsonSerializableType
{
    /**
     * @var ?int $domains Sending domains. `null`: unlimited.
     */
    #[JsonProperty('domains')]
    public ?int $domains;

    /**
     * @var ?int $members Members of the organization. `null`: unlimited.
     */
    #[JsonProperty('members')]
    public ?int $members;

    /**
     * @var ?int $webhookEndpointsPerEnvironment Webhook endpoints per environment. `null`: unlimited.
     */
    #[JsonProperty('webhook_endpoints_per_environment')]
    public ?int $webhookEndpointsPerEnvironment;

    /**
     * @var ?int $contactsPerEnvironment Contacts per environment. `null`: unlimited.
     */
    #[JsonProperty('contacts_per_environment')]
    public ?int $contactsPerEnvironment;

    /**
     * @var ?int $inboxes Inboxes. `null`: unlimited.
     */
    #[JsonProperty('inboxes')]
    public ?int $inboxes;

    /**
     * @param array{
     *   domains?: ?int,
     *   members?: ?int,
     *   webhookEndpointsPerEnvironment?: ?int,
     *   contactsPerEnvironment?: ?int,
     *   inboxes?: ?int,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->domains = $values['domains'] ?? null;
        if (array_key_exists('domains', $values)) {
            $this->_setField('domains');
        }
        $this->members = $values['members'] ?? null;
        if (array_key_exists('members', $values)) {
            $this->_setField('members');
        }
        $this->webhookEndpointsPerEnvironment = $values['webhookEndpointsPerEnvironment'] ?? null;
        if (array_key_exists('webhookEndpointsPerEnvironment', $values)) {
            $this->_setField('webhookEndpointsPerEnvironment');
        }
        $this->contactsPerEnvironment = $values['contactsPerEnvironment'] ?? null;
        if (array_key_exists('contactsPerEnvironment', $values)) {
            $this->_setField('contactsPerEnvironment');
        }
        $this->inboxes = $values['inboxes'] ?? null;
        if (array_key_exists('inboxes', $values)) {
            $this->_setField('inboxes');
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
