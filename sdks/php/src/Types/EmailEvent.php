<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class EmailEvent extends JsonSerializableType
{
    /**
     * @var value-of<EmailEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $emailId The email's id.
     */
    #[JsonProperty('email_id')]
    public string $emailId;

    /**
     * @var value-of<EmailEventType> $type What happened, such as `email.delivered` or `email.bounced`.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var ?string $recipient The recipient this event is about; `null` for the whole email.
     */
    #[JsonProperty('recipient')]
    public ?string $recipient;

    /**
     * @var DateTime $occurredAt When it happened.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @var EmailEventData $data
     */
    #[JsonProperty('data')]
    public EmailEventData $data;

    /**
     * @param array{
     *   object: value-of<EmailEventObject>,
     *   id: string,
     *   emailId: string,
     *   type: value-of<EmailEventType>,
     *   occurredAt: DateTime,
     *   data: EmailEventData,
     *   recipient?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->emailId = $values['emailId'];
        $this->type = $values['type'];
        $this->recipient = $values['recipient'] ?? null;
        if (array_key_exists('recipient', $values)) {
            $this->_setField('recipient');
        }
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
