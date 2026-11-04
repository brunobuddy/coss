<?php

namespace Coss\Scheduling\Calendars\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class UpdateCalendarRequest extends JsonSerializableType
{
    /**
     * @var ?bool $readBusy Whether this calendar's busy times block slots.
     */
    #[JsonProperty('read_busy')]
    public ?bool $readBusy;

    /**
     * @var ?bool $writeTarget Bookings are written to one calendar; setting this moves it here.
     */
    #[JsonProperty('write_target')]
    public ?bool $writeTarget;

    /**
     * @param array{
     *   readBusy?: ?bool,
     *   writeTarget?: ?bool,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->readBusy = $values['readBusy'] ?? null;
        if (array_key_exists('readBusy', $values)) {
            $this->_setField('readBusy');
        }
        $this->writeTarget = $values['writeTarget'] ?? null;
        if (array_key_exists('writeTarget', $values)) {
            $this->_setField('writeTarget');
        }
    }
}
