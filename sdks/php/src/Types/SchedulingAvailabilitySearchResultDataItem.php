<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingAvailabilitySearchResultDataItem extends JsonSerializableType
{
    /**
     * @var string $host The host's id.
     */
    #[JsonProperty('host')]
    public string $host;

    /**
     * @var ?string $uid The host's own uid. `null` when none is set.
     */
    #[JsonProperty('uid')]
    public ?string $uid;

    /**
     * @var array<SchedulingAvailabilitySearchResultDataItemSlotsItem> $slots The host's soonest slots.
     */
    #[JsonProperty('slots'), ArrayType([SchedulingAvailabilitySearchResultDataItemSlotsItem::class])]
    public array $slots;

    /**
     * @param array{
     *   host: string,
     *   slots: array<SchedulingAvailabilitySearchResultDataItemSlotsItem>,
     *   uid?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->host = $values['host'];
        $this->uid = $values['uid'] ?? null;
        if (array_key_exists('uid', $values)) {
            $this->_setField('uid');
        }
        $this->slots = $values['slots'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
