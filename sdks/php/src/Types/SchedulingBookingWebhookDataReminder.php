<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * `scheduling.booking.reminder`: which reminder this is.
 */
class SchedulingBookingWebhookDataReminder extends JsonSerializableType
{
    /**
     * @var string $key Which reminder this is.
     */
    #[JsonProperty('key')]
    public string $key;

    /**
     * @var value-of<SchedulingBookingWebhookDataReminderAnchor> $anchor The moment it's timed from.
     */
    #[JsonProperty('anchor')]
    public string $anchor;

    /**
     * @var ?float $beforeMinutes How long before the anchor. `null` when it's after.
     */
    #[JsonProperty('before_minutes')]
    public ?float $beforeMinutes;

    /**
     * @var ?float $afterMinutes How long after the anchor. `null` when it's before.
     */
    #[JsonProperty('after_minutes')]
    public ?float $afterMinutes;

    /**
     * @var string $scheduledFor When it was due.
     */
    #[JsonProperty('scheduled_for')]
    public string $scheduledFor;

    /**
     * @param array{
     *   key: string,
     *   anchor: value-of<SchedulingBookingWebhookDataReminderAnchor>,
     *   scheduledFor: string,
     *   beforeMinutes?: ?float,
     *   afterMinutes?: ?float,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->key = $values['key'];
        $this->anchor = $values['anchor'];
        $this->beforeMinutes = $values['beforeMinutes'] ?? null;
        if (array_key_exists('beforeMinutes', $values)) {
            $this->_setField('beforeMinutes');
        }
        $this->afterMinutes = $values['afterMinutes'] ?? null;
        if (array_key_exists('afterMinutes', $values)) {
            $this->_setField('afterMinutes');
        }
        $this->scheduledFor = $values['scheduledFor'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
