<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

/**
 * A number sends skip.
 */
class SmsSuppression extends JsonSerializableType
{
    /**
     * @var value-of<SmsSuppressionObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $phoneNumber The suppressed number, in E.164.
     */
    #[JsonProperty('phone_number')]
    public string $phoneNumber;

    /**
     * @var value-of<SmsSuppressionReason> $reason `opt_out`: the number replied STOP (or the carrier says it opted out). `invalid_number`: not a number that can receive SMS. `manual`: added by you.
     */
    #[JsonProperty('reason')]
    public string $reason;

    /**
     * @var ?string $smsId The message whose failure added it, if any.
     */
    #[JsonProperty('sms_id')]
    public ?string $smsId;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<SmsSuppressionObject>,
     *   id: string,
     *   phoneNumber: string,
     *   reason: value-of<SmsSuppressionReason>,
     *   createdAt: DateTime,
     *   smsId?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->phoneNumber = $values['phoneNumber'];
        $this->reason = $values['reason'];
        $this->smsId = $values['smsId'] ?? null;
        if (array_key_exists('smsId', $values)) {
            $this->_setField('smsId');
        }
        $this->createdAt = $values['createdAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
