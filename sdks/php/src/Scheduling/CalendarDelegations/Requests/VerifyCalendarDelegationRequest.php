<?php

namespace Coss\Scheduling\CalendarDelegations\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class VerifyCalendarDelegationRequest extends JsonSerializableType
{
    /**
     * @var string $account A real mailbox on the domain to try. In Microsoft 365, a user principal name.
     */
    #[JsonProperty('account')]
    public string $account;

    /**
     * @param array{
     *   account: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->account = $values['account'];
    }
}
