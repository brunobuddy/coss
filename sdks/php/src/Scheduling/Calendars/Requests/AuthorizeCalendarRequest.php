<?php

namespace Coss\Scheduling\Calendars\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Scheduling\Calendars\Types\AuthorizeCalendarRequestProvider;
use Coss\Core\Json\JsonProperty;

class AuthorizeCalendarRequest extends JsonSerializableType
{
    /**
     * @var value-of<AuthorizeCalendarRequestProvider> $provider Whose consent page to open. CalDAV connects with a password instead.
     */
    #[JsonProperty('provider')]
    public string $provider;

    /**
     * @var ?string $returnUrl Where to send the browser afterwards, on one of the environment's allowed origins. `coss_calendar` says what happened: `connected`, `denied` or `invalid`.
     */
    #[JsonProperty('return_url')]
    public ?string $returnUrl;

    /**
     * @param array{
     *   provider: value-of<AuthorizeCalendarRequestProvider>,
     *   returnUrl?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->provider = $values['provider'];
        $this->returnUrl = $values['returnUrl'] ?? null;
        if (array_key_exists('returnUrl', $values)) {
            $this->_setField('returnUrl');
        }
    }
}
