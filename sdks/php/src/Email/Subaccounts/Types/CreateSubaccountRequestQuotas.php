<?php

namespace Coss\Email\Subaccounts\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Fields left out keep their value; `null` removes a quota.
 */
class CreateSubaccountRequestQuotas extends JsonSerializableType
{
    /**
     * @var ?int $recipientsPerDay Most recipients a day. `null` removes the limit.
     */
    #[JsonProperty('recipients_per_day')]
    public ?int $recipientsPerDay;

    /**
     * @var ?int $recipientsPerSecond Most recipients a second. `null` removes the limit.
     */
    #[JsonProperty('recipients_per_second')]
    public ?int $recipientsPerSecond;

    /**
     * @var ?int $burst How many recipients a moment may take before the per-second rate applies. `null` removes it.
     */
    #[JsonProperty('burst')]
    public ?int $burst;

    /**
     * @param array{
     *   recipientsPerDay?: ?int,
     *   recipientsPerSecond?: ?int,
     *   burst?: ?int,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->recipientsPerDay = $values['recipientsPerDay'] ?? null;
        if (array_key_exists('recipientsPerDay', $values)) {
            $this->_setField('recipientsPerDay');
        }
        $this->recipientsPerSecond = $values['recipientsPerSecond'] ?? null;
        if (array_key_exists('recipientsPerSecond', $values)) {
            $this->_setField('recipientsPerSecond');
        }
        $this->burst = $values['burst'] ?? null;
        if (array_key_exists('burst', $values)) {
            $this->_setField('burst');
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
