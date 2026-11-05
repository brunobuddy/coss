<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class BillingAddOnsItem extends JsonSerializableType
{
    /**
     * @var string $key e.g. `dedicated_ips`.
     */
    #[JsonProperty('key')]
    public string $key;

    /**
     * @var string $name The add-on's name.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var int $quantity How many units are on the contract.
     */
    #[JsonProperty('quantity')]
    public int $quantity;

    /**
     * @var int $unitAmount The price per unit and interval, in cents.
     */
    #[JsonProperty('unit_amount')]
    public int $unitAmount;

    /**
     * @var value-of<BillingAddOnsItemInterval> $interval How often it's charged.
     */
    #[JsonProperty('interval')]
    public string $interval;

    /**
     * @param array{
     *   key: string,
     *   name: string,
     *   quantity: int,
     *   unitAmount: int,
     *   interval: value-of<BillingAddOnsItemInterval>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->key = $values['key'];
        $this->name = $values['name'];
        $this->quantity = $values['quantity'];
        $this->unitAmount = $values['unitAmount'];
        $this->interval = $values['interval'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
