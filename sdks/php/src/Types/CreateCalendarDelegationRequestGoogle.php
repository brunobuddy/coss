<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class CreateCalendarDelegationRequestGoogle extends JsonSerializableType
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
     * @var string $serviceAccountKey The whole JSON key of a service account in your Google Cloud project. Never returned.
     */
    #[JsonProperty('service_account_key')]
    public string $serviceAccountKey;

    /**
     * @param array{
     *   domain: string,
     *   serviceAccountKey: string,
     *   matchHostEmail?: ?bool,
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
        $this->serviceAccountKey = $values['serviceAccountKey'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
