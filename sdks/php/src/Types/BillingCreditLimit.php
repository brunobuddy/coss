<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Where the organization stands against its credit limit; `null`: it has none.
 */
class BillingCreditLimit extends JsonSerializableType
{
    /**
     * @var int $limit What coss.com carries before live sending is held. It rises as payments settle.
     */
    #[JsonProperty('limit')]
    public int $limit;

    /**
     * @var int $used Usage not invoiced yet, unpaid invoices and recent usage charges.
     */
    #[JsonProperty('used')]
    public int $used;

    /**
     * @var ?int $chargeThreshold Usage not invoiced yet is charged early at this amount; `null`: it isn't charged automatically.
     */
    #[JsonProperty('charge_threshold')]
    public ?int $chargeThreshold;

    /**
     * @param array{
     *   limit: int,
     *   used: int,
     *   chargeThreshold?: ?int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->limit = $values['limit'];
        $this->used = $values['used'];
        $this->chargeThreshold = $values['chargeThreshold'] ?? null;
        if (array_key_exists('chargeThreshold', $values)) {
            $this->_setField('chargeThreshold');
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
