<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class BillingWebhookEventZeroData extends JsonSerializableType
{
    /**
     * @var string $organizationId The organization's id.
     */
    #[JsonProperty('organization_id')]
    public string $organizationId;

    /**
     * @var DateTime $occurredAt When it happened: sort events by it.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @var InvoiceSummary $invoice
     */
    #[JsonProperty('invoice')]
    public InvoiceSummary $invoice;

    /**
     * @param array{
     *   organizationId: string,
     *   occurredAt: DateTime,
     *   invoice: InvoiceSummary,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->organizationId = $values['organizationId'];
        $this->occurredAt = $values['occurredAt'];
        $this->invoice = $values['invoice'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
