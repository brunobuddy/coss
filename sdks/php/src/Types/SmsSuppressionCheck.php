<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SmsSuppressionCheck extends JsonSerializableType
{
    /**
     * @var value-of<SmsSuppressionCheckObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $phoneNumber The number checked, in E.164.
     */
    #[JsonProperty('phone_number')]
    public string $phoneNumber;

    /**
     * @var bool $suppressed Whether a send to this number would be skipped.
     */
    #[JsonProperty('suppressed')]
    public bool $suppressed;

    /**
     * @var ?SmsSuppressionCheckSuppression $suppression A number sends skip.
     */
    #[JsonProperty('suppression')]
    public ?SmsSuppressionCheckSuppression $suppression;

    /**
     * @param array{
     *   object: value-of<SmsSuppressionCheckObject>,
     *   phoneNumber: string,
     *   suppressed: bool,
     *   suppression?: ?SmsSuppressionCheckSuppression,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->phoneNumber = $values['phoneNumber'];
        $this->suppressed = $values['suppressed'];
        $this->suppression = $values['suppression'] ?? null;
        if (array_key_exists('suppression', $values)) {
            $this->_setField('suppression');
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
