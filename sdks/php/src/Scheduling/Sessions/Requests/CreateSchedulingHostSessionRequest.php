<?php

namespace Coss\Scheduling\Sessions\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class CreateSchedulingHostSessionRequest extends JsonSerializableType
{
    /**
     * @var ?int $expiresIn Seconds until it stops working. At most a day.
     */
    #[JsonProperty('expires_in')]
    public ?int $expiresIn;

    /**
     * @var ?bool $readOnly The host can look but not change anything.
     */
    #[JsonProperty('read_only')]
    public ?bool $readOnly;

    /**
     * @param array{
     *   expiresIn?: ?int,
     *   readOnly?: ?bool,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->expiresIn = $values['expiresIn'] ?? null;
        if (array_key_exists('expiresIn', $values)) {
            $this->_setField('expiresIn');
        }
        $this->readOnly = $values['readOnly'] ?? null;
        if (array_key_exists('readOnly', $values)) {
            $this->_setField('readOnly');
        }
    }
}
