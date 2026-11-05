<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * What you sent in `checkout` (never the card).
 */
class RiskCheckoutSignals extends JsonSerializableType
{
    /**
     * @var int $amount The amount you sent, in the currency's smallest unit.
     */
    #[JsonProperty('amount')]
    public int $amount;

    /**
     * @var string $currency The currency you sent.
     */
    #[JsonProperty('currency')]
    public string $currency;

    /**
     * @var ?string $cardCountry The card's country. `null` when not given.
     */
    #[JsonProperty('card_country')]
    public ?string $cardCountry;

    /**
     * @var ?value-of<RiskCheckoutSignalsCardFunding> $cardFunding The card's funding type. `null` when not given.
     */
    #[JsonProperty('card_funding')]
    public ?string $cardFunding;

    /**
     * @var ?string $billingCountry The billing country. `null` when not given.
     */
    #[JsonProperty('billing_country')]
    public ?string $billingCountry;

    /**
     * @var ?string $shippingCountry The shipping country. `null` when not given.
     */
    #[JsonProperty('shipping_country')]
    public ?string $shippingCountry;

    /**
     * @param array{
     *   amount: int,
     *   currency: string,
     *   cardCountry?: ?string,
     *   cardFunding?: ?value-of<RiskCheckoutSignalsCardFunding>,
     *   billingCountry?: ?string,
     *   shippingCountry?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->amount = $values['amount'];
        $this->currency = $values['currency'];
        $this->cardCountry = $values['cardCountry'] ?? null;
        if (array_key_exists('cardCountry', $values)) {
            $this->_setField('cardCountry');
        }
        $this->cardFunding = $values['cardFunding'] ?? null;
        if (array_key_exists('cardFunding', $values)) {
            $this->_setField('cardFunding');
        }
        $this->billingCountry = $values['billingCountry'] ?? null;
        if (array_key_exists('billingCountry', $values)) {
            $this->_setField('billingCountry');
        }
        $this->shippingCountry = $values['shippingCountry'] ?? null;
        if (array_key_exists('shippingCountry', $values)) {
            $this->_setField('shippingCountry');
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
