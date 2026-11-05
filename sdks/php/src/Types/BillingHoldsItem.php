<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class BillingHoldsItem extends JsonSerializableType
{
    /**
     * @var value-of<BillingHoldsItemReason> $reason `delinquent`: an invoice is past its grace period. `spend_limit`: the spend limit was reached. `credit_limit`: the credit limit was reached, or a usage charge failed. `admin`: placed by coss.com.
     */
    #[JsonProperty('reason')]
    public string $reason;

    /**
     * @var DateTime $since When the hold began.
     */
    #[JsonProperty('since'), Date(Date::TYPE_DATETIME)]
    public DateTime $since;

    /**
     * @param array{
     *   reason: value-of<BillingHoldsItemReason>,
     *   since: DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->reason = $values['reason'];
        $this->since = $values['since'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
