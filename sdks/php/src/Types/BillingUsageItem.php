<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class BillingUsageItem extends JsonSerializableType
{
    /**
     * @var value-of<BillingUsageItemMeter> $meter What is counted, e.g. `email.recipients`.
     */
    #[JsonProperty('meter')]
    public string $meter;

    /**
     * @var int $quantity Units used so far this month.
     */
    #[JsonProperty('quantity')]
    public int $quantity;

    /**
     * @var ?int $included The plan's monthly allowance where usage stops (Free), else `null`.
     */
    #[JsonProperty('included')]
    public ?int $included;

    /**
     * @param array{
     *   meter: value-of<BillingUsageItemMeter>,
     *   quantity: int,
     *   included?: ?int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->meter = $values['meter'];
        $this->quantity = $values['quantity'];
        $this->included = $values['included'] ?? null;
        if (array_key_exists('included', $values)) {
            $this->_setField('included');
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
