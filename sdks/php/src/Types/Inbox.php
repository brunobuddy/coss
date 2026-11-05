<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class Inbox extends JsonSerializableType
{
    /**
     * @var value-of<InboxObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $address The inbox's email address (`username@domain`).
     */
    #[JsonProperty('address')]
    public string $address;

    /**
     * @var string $username The part of the address before the `@`.
     */
    #[JsonProperty('username')]
    public string $username;

    /**
     * @var string $domain The part of the address after the `@`.
     */
    #[JsonProperty('domain')]
    public string $domain;

    /**
     * @var value-of<InboxKind> $kind `managed`: at the environment's own domain under coss.com's inbound domain (no DNS setup). `domain`: at one of the environment's receiving domains.
     */
    #[JsonProperty('kind')]
    public string $kind;

    /**
     * @var ?string $displayName The name messages from the inbox are sent with.
     */
    #[JsonProperty('display_name')]
    public ?string $displayName;

    /**
     * @var ?string $clientId Your own id for the inbox, e.g. your agent's or user's (unique per environment).
     */
    #[JsonProperty('client_id')]
    public ?string $clientId;

    /**
     * @var bool $canSend Whether messages can be sent from the inbox. Inboxes at coss.com's inbound domain only receive in live environments: create the inbox at a receiving domain under one of your verified domains to send from it.
     */
    #[JsonProperty('can_send')]
    public bool $canSend;

    /**
     * @var bool $sandbox Whether it belongs to a sandbox environment.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

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
     *   object: value-of<InboxObject>,
     *   id: string,
     *   address: string,
     *   username: string,
     *   domain: string,
     *   kind: value-of<InboxKind>,
     *   canSend: bool,
     *   sandbox: bool,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   displayName?: ?string,
     *   clientId?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->address = $values['address'];
        $this->username = $values['username'];
        $this->domain = $values['domain'];
        $this->kind = $values['kind'];
        $this->displayName = $values['displayName'] ?? null;
        if (array_key_exists('displayName', $values)) {
            $this->_setField('displayName');
        }
        $this->clientId = $values['clientId'] ?? null;
        if (array_key_exists('clientId', $values)) {
            $this->_setField('clientId');
        }
        $this->canSend = $values['canSend'];
        $this->sandbox = $values['sandbox'];
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
