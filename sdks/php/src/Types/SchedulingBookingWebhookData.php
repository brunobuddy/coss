<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * Ids, times and statuses only. Retrieve the booking for anything about the person.
 */
class SchedulingBookingWebhookData extends JsonSerializableType
{
    /**
     * @var string $bookingId The booking's id.
     */
    #[JsonProperty('booking_id')]
    public string $bookingId;

    /**
     * @var string $eventTypeId The booked event type's id.
     */
    #[JsonProperty('event_type_id')]
    public string $eventTypeId;

    /**
     * @var value-of<SchedulingBookingWebhookDataStatus> $status The booking's status after this event.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var string $start When the booking starts.
     */
    #[JsonProperty('start')]
    public string $start;

    /**
     * @var string $end When the booking ends.
     */
    #[JsonProperty('end')]
    public string $end;

    /**
     * @var array<string> $hostIds The ids of the hosts taking it.
     */
    #[JsonProperty('host_ids'), ArrayType(['string'])]
    public array $hostIds;

    /**
     * @var array<string> $attendeeUids Your uids of its attendees.
     */
    #[JsonProperty('attendee_uids'), ArrayType(['string'])]
    public array $attendeeUids;

    /**
     * @var ?string $seriesId The id of its series. `null`: not part of one.
     */
    #[JsonProperty('series_id')]
    public ?string $seriesId;

    /**
     * @var ?string $previousStart `scheduling.booking.rescheduled`: when it used to start.
     */
    #[JsonProperty('previous_start')]
    public ?string $previousStart;

    /**
     * @var ?SchedulingBookingWebhookDataReminder $reminder `scheduling.booking.reminder`: which reminder this is.
     */
    #[JsonProperty('reminder')]
    public ?SchedulingBookingWebhookDataReminder $reminder;

    /**
     * @var string $occurredAt When this happened.
     */
    #[JsonProperty('occurred_at')]
    public string $occurredAt;

    /**
     * @param array{
     *   bookingId: string,
     *   eventTypeId: string,
     *   status: value-of<SchedulingBookingWebhookDataStatus>,
     *   start: string,
     *   end: string,
     *   hostIds: array<string>,
     *   attendeeUids: array<string>,
     *   occurredAt: string,
     *   seriesId?: ?string,
     *   previousStart?: ?string,
     *   reminder?: ?SchedulingBookingWebhookDataReminder,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->bookingId = $values['bookingId'];
        $this->eventTypeId = $values['eventTypeId'];
        $this->status = $values['status'];
        $this->start = $values['start'];
        $this->end = $values['end'];
        $this->hostIds = $values['hostIds'];
        $this->attendeeUids = $values['attendeeUids'];
        $this->seriesId = $values['seriesId'] ?? null;
        if (array_key_exists('seriesId', $values)) {
            $this->_setField('seriesId');
        }
        $this->previousStart = $values['previousStart'] ?? null;
        if (array_key_exists('previousStart', $values)) {
            $this->_setField('previousStart');
        }
        $this->reminder = $values['reminder'] ?? null;
        if (array_key_exists('reminder', $values)) {
            $this->_setField('reminder');
        }
        $this->occurredAt = $values['occurredAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
