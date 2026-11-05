<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * The payment method on file. `null`: none.
 */
class BillingPaymentMethod extends JsonSerializableType
{
    /**
     * @var string $type Its type, such as `card`.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var ?string $brand The card's brand. `null` for other types.
     */
    #[JsonProperty('brand')]
    public ?string $brand;

    /**
     * @var ?string $last4 The card's last four digits. `null` for other types.
     */
    #[JsonProperty('last4')]
    public ?string $last4;

    /**
     * @param array{
     *   type: string,
     *   brand?: ?string,
     *   last4?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->type = $values['type'];
        $this->brand = $values['brand'] ?? null;
        if (array_key_exists('brand', $values)) {
            $this->_setField('brand');
        }
        $this->last4 = $values['last4'] ?? null;
        if (array_key_exists('last4', $values)) {
            $this->_setField('last4');
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
