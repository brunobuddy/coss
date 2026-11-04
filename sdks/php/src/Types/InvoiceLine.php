<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class InvoiceLine extends JsonSerializableType
{
    /**
     * @var value-of<InvoiceLineObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<InvoiceLineKind> $kind What it's for: `plan_fee`, `proration`, `usage`, `credit`, `discount`, `commitment_fee`, `commitment_shortfall`, `add_on`, `adjustment` or `write_off`.
     */
    #[JsonProperty('kind')]
    public string $kind;

    /**
     * @var string $description The line as it reads on the invoice.
     */
    #[JsonProperty('description')]
    public string $description;

    /**
     * @var ?value-of<InvoiceLineMeter> $meter The meter of a `usage` line. `null` for other lines.
     */
    #[JsonProperty('meter')]
    public ?string $meter;

    /**
     * @var ?string $dimension What the meter is split by, such as `country=US`. `null`: not split.
     */
    #[JsonProperty('dimension')]
    public ?string $dimension;

    /**
     * @var ?int $quantity Units on this line. `null` when it isn't priced by the unit.
     */
    #[JsonProperty('quantity')]
    public ?int $quantity;

    /**
     * @var ?int $includedQuantity Units covered by an allowance or committed volume (not charged).
     */
    #[JsonProperty('included_quantity')]
    public ?int $includedQuantity;

    /**
     * @var ?string $unitPrice Dollars per unit, e.g. `0.0004`; `null` when the price varies by volume.
     */
    #[JsonProperty('unit_price')]
    public ?string $unitPrice;

    /**
     * @var int $amount An amount in cents (USD).
     */
    #[JsonProperty('amount')]
    public int $amount;

    /**
     * @var InvoiceLinePeriod $period What period it covers.
     */
    #[JsonProperty('period')]
    public InvoiceLinePeriod $period;

    /**
     * @param array{
     *   object: value-of<InvoiceLineObject>,
     *   id: string,
     *   kind: value-of<InvoiceLineKind>,
     *   description: string,
     *   amount: int,
     *   period: InvoiceLinePeriod,
     *   meter?: ?value-of<InvoiceLineMeter>,
     *   dimension?: ?string,
     *   quantity?: ?int,
     *   includedQuantity?: ?int,
     *   unitPrice?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->kind = $values['kind'];
        $this->description = $values['description'];
        $this->meter = $values['meter'] ?? null;
        if (array_key_exists('meter', $values)) {
            $this->_setField('meter');
        }
        $this->dimension = $values['dimension'] ?? null;
        if (array_key_exists('dimension', $values)) {
            $this->_setField('dimension');
        }
        $this->quantity = $values['quantity'] ?? null;
        if (array_key_exists('quantity', $values)) {
            $this->_setField('quantity');
        }
        $this->includedQuantity = $values['includedQuantity'] ?? null;
        if (array_key_exists('includedQuantity', $values)) {
            $this->_setField('includedQuantity');
        }
        $this->unitPrice = $values['unitPrice'] ?? null;
        if (array_key_exists('unitPrice', $values)) {
            $this->_setField('unitPrice');
        }
        $this->amount = $values['amount'];
        $this->period = $values['period'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
