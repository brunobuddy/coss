<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingCalendarDelegation extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingCalendarDelegationObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<SchedulingCalendarDelegationProvider> $provider
     */
    #[JsonProperty('provider')]
    public string $provider;

    /**
     * @var string $domain
     */
    #[JsonProperty('domain')]
    public string $domain;

    /**
     * @var value-of<SchedulingCalendarDelegationStatus> $status `pending`: not verified yet. `failing`: the provider refused access, and its hosts aren't offered until it's back. `deleting`: its connections are being removed.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var bool $matchHostEmail
     */
    #[JsonProperty('match_host_email')]
    public bool $matchHostEmail;

    /**
     * @var string $clientId Google: the numeric client ID your Workspace admin authorizes.
     */
    #[JsonProperty('client_id')]
    public string $clientId;

    /**
     * @var ?string $tenantId
     */
    #[JsonProperty('tenant_id')]
    public ?string $tenantId;

    /**
     * @var array<string> $scopes What to authorize: OAuth scopes in Google's Admin console, the application permission in Entra.
     */
    #[JsonProperty('scopes'), ArrayType(['string'])]
    public array $scopes;

    /**
     * @var ?string $verifiedAccount
     */
    #[JsonProperty('verified_account')]
    public ?string $verifiedAccount;

    /**
     * @var ?string $lastErrorCode
     */
    #[JsonProperty('last_error_code')]
    public ?string $lastErrorCode;

    /**
     * @var ?string $failingSince
     */
    #[JsonProperty('failing_since')]
    public ?string $failingSince;

    /**
     * @var ?string $secretExpiresAt
     */
    #[JsonProperty('secret_expires_at')]
    public ?string $secretExpiresAt;

    /**
     * @var int $hostsConnected
     */
    #[JsonProperty('hosts_connected')]
    public int $hostsConnected;

    /**
     * @var int $hostsFailed Hosts whose mailbox can't be reached, or who are out while this is `failing`.
     */
    #[JsonProperty('hosts_failed')]
    public int $hostsFailed;

    /**
     * @var string $createdAt
     */
    #[JsonProperty('created_at')]
    public string $createdAt;

    /**
     * @var string $updatedAt
     */
    #[JsonProperty('updated_at')]
    public string $updatedAt;

    /**
     * @param array{
     *   object: value-of<SchedulingCalendarDelegationObject>,
     *   id: string,
     *   provider: value-of<SchedulingCalendarDelegationProvider>,
     *   domain: string,
     *   status: value-of<SchedulingCalendarDelegationStatus>,
     *   matchHostEmail: bool,
     *   clientId: string,
     *   scopes: array<string>,
     *   hostsConnected: int,
     *   hostsFailed: int,
     *   createdAt: string,
     *   updatedAt: string,
     *   tenantId?: ?string,
     *   verifiedAccount?: ?string,
     *   lastErrorCode?: ?string,
     *   failingSince?: ?string,
     *   secretExpiresAt?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->provider = $values['provider'];
        $this->domain = $values['domain'];
        $this->status = $values['status'];
        $this->matchHostEmail = $values['matchHostEmail'];
        $this->clientId = $values['clientId'];
        $this->tenantId = $values['tenantId'] ?? null;
        if (array_key_exists('tenantId', $values)) {
            $this->_setField('tenantId');
        }
        $this->scopes = $values['scopes'];
        $this->verifiedAccount = $values['verifiedAccount'] ?? null;
        if (array_key_exists('verifiedAccount', $values)) {
            $this->_setField('verifiedAccount');
        }
        $this->lastErrorCode = $values['lastErrorCode'] ?? null;
        if (array_key_exists('lastErrorCode', $values)) {
            $this->_setField('lastErrorCode');
        }
        $this->failingSince = $values['failingSince'] ?? null;
        if (array_key_exists('failingSince', $values)) {
            $this->_setField('failingSince');
        }
        $this->secretExpiresAt = $values['secretExpiresAt'] ?? null;
        if (array_key_exists('secretExpiresAt', $values)) {
            $this->_setField('secretExpiresAt');
        }
        $this->hostsConnected = $values['hostsConnected'];
        $this->hostsFailed = $values['hostsFailed'];
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
