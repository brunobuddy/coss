<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Its own sending limits.
 */
class SubaccountQuotas extends JsonSerializableType
{
    /**
     * @var ?int $recipientsPerDay Recipients it may send to per day; `null`: only your organization's quota.
     */
    #[JsonProperty('recipients_per_day')]
    public ?int $recipientsPerDay;

    /**
     * @var ?int $recipientsPerSecond Recipients it may send to per second; `null`: only your organization's quota.
     */
    #[JsonProperty('recipients_per_second')]
    public ?int $recipientsPerSecond;

    /**
     * @var ?int $burst How many recipients a moment may take before the per-second rate applies; `null`: the per-second rate.
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
