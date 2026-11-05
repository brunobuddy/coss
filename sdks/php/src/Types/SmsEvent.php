<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class SmsEvent extends JsonSerializableType
{
    /**
     * @var value-of<SmsEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $smsId The id of the message.
     */
    #[JsonProperty('sms_id')]
    public string $smsId;

    /**
     * @var value-of<SmsEventType> $type What happened: `sms.scheduled`, `sms.sent`, `sms.delivered`, `sms.undelivered`, `sms.failed`, `sms.suppressed` or `sms.canceled`.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var DateTime $occurredAt When it happened.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @var SmsEventData $data
     */
    #[JsonProperty('data')]
    public SmsEventData $data;

    /**
     * @param array{
     *   object: value-of<SmsEventObject>,
     *   id: string,
     *   smsId: string,
     *   type: value-of<SmsEventType>,
     *   occurredAt: DateTime,
     *   data: SmsEventData,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->smsId = $values['smsId'];
        $this->type = $values['type'];
        $this->occurredAt = $values['occurredAt'];
        $this->data = $values['data'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
