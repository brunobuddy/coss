<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingCalendarConnectionCalendarsItem extends JsonSerializableType
{
    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $externalId The calendar's id at the provider.
     */
    #[JsonProperty('external_id')]
    public string $externalId;

    /**
     * @var bool $readBusy Whether its busy times block slots.
     */
    #[JsonProperty('read_busy')]
    public bool $readBusy;

    /**
     * @var bool $writeTarget Whether bookings are written to it.
     */
    #[JsonProperty('write_target')]
    public bool $writeTarget;

    /**
     * @var ?string $verifiedAt When it was last read successfully. `null`: not read yet.
     */
    #[JsonProperty('verified_at')]
    public ?string $verifiedAt;

    /**
     * @param array{
     *   id: string,
     *   externalId: string,
     *   readBusy: bool,
     *   writeTarget: bool,
     *   verifiedAt?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->externalId = $values['externalId'];
        $this->readBusy = $values['readBusy'];
        $this->writeTarget = $values['writeTarget'];
        $this->verifiedAt = $values['verifiedAt'] ?? null;
        if (array_key_exists('verifiedAt', $values)) {
            $this->_setField('verifiedAt');
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
