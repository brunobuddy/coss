<?php

namespace Coss\Scheduling\Holds\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class ConfirmHoldRequest extends JsonSerializableType
{
    /**
     * @var ?bool $ifStillFree After the hold expired, book anyway if nobody else took the slot. Default: refuse with `hold_expired`.
     */
    #[JsonProperty('if_still_free')]
    public ?bool $ifStillFree;

    /**
     * @param array{
     *   ifStillFree?: ?bool,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->ifStillFree = $values['ifStillFree'] ?? null;
        if (array_key_exists('ifStillFree', $values)) {
            $this->_setField('ifStillFree');
        }
    }
}
