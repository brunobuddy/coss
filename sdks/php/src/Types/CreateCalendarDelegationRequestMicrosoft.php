<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class CreateCalendarDelegationRequestMicrosoft extends JsonSerializableType
{
    /**
     * @var string $domain The Workspace or Microsoft 365 domain. Only addresses on exactly this domain connect, not its subdomains.
     */
    #[JsonProperty('domain')]
    public string $domain;

    /**
     * @var ?bool $matchHostEmail Whether a host's `email` picks their mailbox when `calendar_account` isn't set. Turn it off if end users can type their own email into your app: otherwise one could name a colleague's address and reach that calendar.
     */
    #[JsonProperty('match_host_email')]
    public ?bool $matchHostEmail;

    /**
     * @var string $tenantId The Directory (tenant) ID.
     */
    #[JsonProperty('tenant_id')]
    public string $tenantId;

    /**
     * @var string $clientId The Application (client) ID.
     */
    #[JsonProperty('client_id')]
    public string $clientId;

    /**
     * @var string $clientSecret A client secret of that app. Never returned.
     */
    #[JsonProperty('client_secret')]
    public string $clientSecret;

    /**
     * @var ?DateTime $secretExpiresAt When the Entra client secret expires. Owners and admins are warned 14 days before.
     */
    #[JsonProperty('secret_expires_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $secretExpiresAt;

    /**
     * @param array{
     *   domain: string,
     *   tenantId: string,
     *   clientId: string,
     *   clientSecret: string,
     *   matchHostEmail?: ?bool,
     *   secretExpiresAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->domain = $values['domain'];
        $this->matchHostEmail = $values['matchHostEmail'] ?? null;
        if (array_key_exists('matchHostEmail', $values)) {
            $this->_setField('matchHostEmail');
        }
        $this->tenantId = $values['tenantId'];
        $this->clientId = $values['clientId'];
        $this->clientSecret = $values['clientSecret'];
        $this->secretExpiresAt = $values['secretExpiresAt'] ?? null;
        if (array_key_exists('secretExpiresAt', $values)) {
            $this->_setField('secretExpiresAt');
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
