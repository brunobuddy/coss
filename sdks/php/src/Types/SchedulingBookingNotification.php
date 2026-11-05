<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingBookingNotification extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingBookingNotificationObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $kind `reminder` for an entry of `reminders`; otherwise a standard notification, or `started`/`ended`.
     */
    #[JsonProperty('kind')]
    public string $kind;

    /**
     * @var ?string $reminderKey
     */
    #[JsonProperty('reminder_key')]
    public ?string $reminderKey;

    /**
     * @var value-of<SchedulingBookingNotificationChannel> $channel
     */
    #[JsonProperty('channel')]
    public string $channel;

    /**
     * @var value-of<SchedulingBookingNotificationRecipient> $recipient
     */
    #[JsonProperty('recipient')]
    public string $recipient;

    /**
     * @var string $dueAt
     */
    #[JsonProperty('due_at')]
    public string $dueAt;

    /**
     * @var ?string $finishedAt
     */
    #[JsonProperty('finished_at')]
    public ?string $finishedAt;

    /**
     * @var ?string $outcome `null` while it's waiting. `sent`, or why not: `too_late`, `filtered`, `no_show`, `no_address`, `no_sender`, `stale`, `superseded`, `failed`.
     */
    #[JsonProperty('outcome')]
    public ?string $outcome;

    /**
     * @param array{
     *   object: value-of<SchedulingBookingNotificationObject>,
     *   id: string,
     *   kind: string,
     *   channel: value-of<SchedulingBookingNotificationChannel>,
     *   recipient: value-of<SchedulingBookingNotificationRecipient>,
     *   dueAt: string,
     *   reminderKey?: ?string,
     *   finishedAt?: ?string,
     *   outcome?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->kind = $values['kind'];
        $this->reminderKey = $values['reminderKey'] ?? null;
        if (array_key_exists('reminderKey', $values)) {
            $this->_setField('reminderKey');
        }
        $this->channel = $values['channel'];
        $this->recipient = $values['recipient'];
        $this->dueAt = $values['dueAt'];
        $this->finishedAt = $values['finishedAt'] ?? null;
        if (array_key_exists('finishedAt', $values)) {
            $this->_setField('finishedAt');
        }
        $this->outcome = $values['outcome'] ?? null;
        if (array_key_exists('outcome', $values)) {
            $this->_setField('outcome');
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
