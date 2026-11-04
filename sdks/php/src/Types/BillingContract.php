<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

/**
 * The contract in effect; `null` on the Free plan.
 */
class BillingContract extends JsonSerializableType
{
    /**
     * @var string $id The contract's id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<BillingContractKind> $kind `self_serve`: chosen in the dashboard. `sales`: agreed with coss.com. `internal`: coss.com's own.
     */
    #[JsonProperty('kind')]
    public string $kind;

    /**
     * @var DateTime $effectiveFrom When it took effect.
     */
    #[JsonProperty('effective_from'), Date(Date::TYPE_DATETIME)]
    public DateTime $effectiveFrom;

    /**
     * @var ?DateTime $effectiveUntil When it ends. `null`: no end is set.
     */
    #[JsonProperty('effective_until'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $effectiveUntil;

    /**
     * @var ?DateTime $termEnd End of a committed term.
     */
    #[JsonProperty('term_end'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $termEnd;

    /**
     * @var bool $autoRenew Whether a committed term renews when it ends.
     */
    #[JsonProperty('auto_renew')]
    public bool $autoRenew;

    /**
     * @param array{
     *   id: string,
     *   kind: value-of<BillingContractKind>,
     *   effectiveFrom: DateTime,
     *   autoRenew: bool,
     *   effectiveUntil?: ?DateTime,
     *   termEnd?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->kind = $values['kind'];
        $this->effectiveFrom = $values['effectiveFrom'];
        $this->effectiveUntil = $values['effectiveUntil'] ?? null;
        if (array_key_exists('effectiveUntil', $values)) {
            $this->_setField('effectiveUntil');
        }
        $this->termEnd = $values['termEnd'] ?? null;
        if (array_key_exists('termEnd', $values)) {
            $this->_setField('termEnd');
        }
        $this->autoRenew = $values['autoRenew'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
