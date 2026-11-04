<?php

namespace Coss\Scheduling\CalendarDelegations\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class UpdateCalendarDelegationRequest extends JsonSerializableType
{
    /**
     * @var ?bool $matchHostEmail Whether a host's `email` picks their mailbox when `calendar_account` isn't set. Turn it off if end users can type their own email into your app: otherwise one could name a colleague's address and reach that calendar.
     */
    #[JsonProperty('match_host_email')]
    public ?bool $matchHostEmail;

    /**
     * @var ?string $serviceAccountKey A new key. It's tried on the verified mailbox before it replaces the old one.
     */
    #[JsonProperty('service_account_key')]
    public ?string $serviceAccountKey;

    /**
     * @var ?string $clientSecret A new client secret. It's tried on the verified mailbox before it replaces the old one.
     */
    #[JsonProperty('client_secret')]
    public ?string $clientSecret;

    /**
     * @var ?DateTime $secretExpiresAt When the Entra client secret expires. Owners and admins are warned 14 days before.
     */
    #[JsonProperty('secret_expires_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $secretExpiresAt;

    /**
     * @param array{
     *   matchHostEmail?: ?bool,
     *   serviceAccountKey?: ?string,
     *   clientSecret?: ?string,
     *   secretExpiresAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->matchHostEmail = $values['matchHostEmail'] ?? null;
        if (array_key_exists('matchHostEmail', $values)) {
            $this->_setField('matchHostEmail');
        }
        $this->serviceAccountKey = $values['serviceAccountKey'] ?? null;
        if (array_key_exists('serviceAccountKey', $values)) {
            $this->_setField('serviceAccountKey');
        }
        $this->clientSecret = $values['clientSecret'] ?? null;
        if (array_key_exists('clientSecret', $values)) {
            $this->_setField('clientSecret');
        }
        $this->secretExpiresAt = $values['secretExpiresAt'] ?? null;
        if (array_key_exists('secretExpiresAt', $values)) {
            $this->_setField('secretExpiresAt');
        }
    }
}
