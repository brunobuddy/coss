<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Details of the event, where it has any.
 */
class SmsEventData extends JsonSerializableType
{
    /**
     * @var ?SmsEventDataFailure $failure Why the message failed or wasn't delivered.
     */
    #[JsonProperty('failure')]
    public ?SmsEventDataFailure $failure;

    /**
     * @var ?string $providerErrorCode The provider's or carrier's own error code, e.g. `30007`.
     */
    #[JsonProperty('provider_error_code')]
    public ?string $providerErrorCode;

    /**
     * @var ?SmsEventDataSuppression $suppression `sms.suppressed`: the entry that made coss.com skip the number.
     */
    #[JsonProperty('suppression')]
    public ?SmsEventDataSuppression $suppression;

    /**
     * @param array{
     *   failure?: ?SmsEventDataFailure,
     *   providerErrorCode?: ?string,
     *   suppression?: ?SmsEventDataSuppression,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->failure = $values['failure'] ?? null;
        if (array_key_exists('failure', $values)) {
            $this->_setField('failure');
        }
        $this->providerErrorCode = $values['providerErrorCode'] ?? null;
        if (array_key_exists('providerErrorCode', $values)) {
            $this->_setField('providerErrorCode');
        }
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
