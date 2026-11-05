<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingBooking extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingBookingObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $eventType The id of the booked event type.
     */
    #[JsonProperty('event_type')]
    public string $eventType;

    /**
     * @var value-of<SchedulingBookingStatus> $status `held`: a hold keeping the slot until `hold_expires_at`, uncharged and known to nobody. `pending_approval`: holds the time until approved, declined or `approval_expires_at`. `confirmed`: booked. `cancelled`: cancelled, or a hold released or expired. `declined`: refused, or its approval deadline passed.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var string $title The event type's title when this was booked.
     */
    #[JsonProperty('title')]
    public string $title;

    /**
     * @var string $start When the booking starts.
     */
    #[JsonProperty('start')]
    public string $start;

    /**
     * @var string $end When the booking ends, without buffers.
     */
    #[JsonProperty('end')]
    public string $end;

    /**
     * @var array<string> $hosts The ids of the hosts taking it.
     */
    #[JsonProperty('hosts'), ArrayType(['string'])]
    public array $hosts;

    /**
     * @var array<SchedulingBookingAttendeesItem> $attendees Who's booked: the attendee first, then any guests they added. A group session's seat is its own booking.
     */
    #[JsonProperty('attendees'), ArrayType([SchedulingBookingAttendeesItem::class])]
    public array $attendees;

    /**
     * @var SchedulingLocation $location
     */
    #[JsonProperty('location')]
    public SchedulingLocation $location;

    /**
     * @var ?string $holdExpiresAt When a `held` booking gives up its slot. `null` otherwise.
     */
    #[JsonProperty('hold_expires_at')]
    public ?string $holdExpiresAt;

    /**
     * @var ?string $approvalExpiresAt When a `pending_approval` booking is declined if nobody decides. `null` otherwise.
     */
    #[JsonProperty('approval_expires_at')]
    public ?string $approvalExpiresAt;

    /**
     * @var ?string $series The id of the series it belongs to. `null`: not part of one.
     */
    #[JsonProperty('series')]
    public ?string $series;

    /**
     * @var ?float $seriesIndex Its place in the series, from 0. `null`: not part of one.
     */
    #[JsonProperty('series_index')]
    public ?float $seriesIndex;

    /**
     * @var ?string $groupSession The id of the group session whose seat this is. `null`: not a seat.
     */
    #[JsonProperty('group_session')]
    public ?string $groupSession;

    /**
     * @var bool $calendarUnverified Reserved for flagging a booking made on last known calendar data. Nothing sets it yet, so it's always `false`.
     */
    #[JsonProperty('calendar_unverified')]
    public bool $calendarUnverified;

    /**
     * @var ?string $externalConflictAt When something else landed on this time in the host's calendar, or the host changed the event. The booking stands. `null`: no conflict known.
     */
    #[JsonProperty('external_conflict_at')]
    public ?string $externalConflictAt;

    /**
     * @var ?string $noShowAt When the attendee was marked as a no-show. `null`: not marked.
     */
    #[JsonProperty('no_show_at')]
    public ?string $noShowAt;

    /**
     * @var ?string $cancelledAt When it was cancelled. `null`: not cancelled.
     */
    #[JsonProperty('cancelled_at')]
    public ?string $cancelledAt;

    /**
     * @var ?value-of<SchedulingBookingCancelledBy> $cancelledBy Who cancelled it: `api_key`, `user` (the dashboard), `host_session`, `booker_session`, `manage_session` (the attendee's link) or `system`. `null`: not cancelled, or cancelled before this was recorded.
     */
    #[JsonProperty('cancelled_by')]
    public ?string $cancelledBy;

    /**
     * @var ?string $cancellationReason Why, if they said. Only when retrieving one booking. It's erased with the attendee's details, and it's never in webhooks, logs or emails.
     */
    #[JsonProperty('cancellation_reason')]
    public ?string $cancellationReason;

    /**
     * @var array<string, string> $metadata Your own key-value pairs.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public array $metadata;

    /**
     * @var string $createdAt
     */
    #[JsonProperty('created_at')]
    public string $createdAt;

    /**
     * @var string $updatedAt
     */
    #[JsonProperty('updated_at')]
    public string $updatedAt;

    /**
     * @param array{
     *   object: value-of<SchedulingBookingObject>,
     *   id: string,
     *   eventType: string,
     *   status: value-of<SchedulingBookingStatus>,
     *   title: string,
     *   start: string,
     *   end: string,
     *   hosts: array<string>,
     *   attendees: array<SchedulingBookingAttendeesItem>,
     *   location: SchedulingLocation,
     *   calendarUnverified: bool,
     *   metadata: array<string, string>,
     *   createdAt: string,
     *   updatedAt: string,
     *   holdExpiresAt?: ?string,
     *   approvalExpiresAt?: ?string,
     *   series?: ?string,
     *   seriesIndex?: ?float,
     *   groupSession?: ?string,
     *   externalConflictAt?: ?string,
     *   noShowAt?: ?string,
     *   cancelledAt?: ?string,
     *   cancelledBy?: ?value-of<SchedulingBookingCancelledBy>,
     *   cancellationReason?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->eventType = $values['eventType'];
        $this->status = $values['status'];
        $this->title = $values['title'];
        $this->start = $values['start'];
        $this->end = $values['end'];
        $this->hosts = $values['hosts'];
        $this->attendees = $values['attendees'];
        $this->location = $values['location'];
        $this->holdExpiresAt = $values['holdExpiresAt'] ?? null;
        if (array_key_exists('holdExpiresAt', $values)) {
            $this->_setField('holdExpiresAt');
        }
        $this->approvalExpiresAt = $values['approvalExpiresAt'] ?? null;
        if (array_key_exists('approvalExpiresAt', $values)) {
            $this->_setField('approvalExpiresAt');
        }
        $this->series = $values['series'] ?? null;
        if (array_key_exists('series', $values)) {
            $this->_setField('series');
        }
        $this->seriesIndex = $values['seriesIndex'] ?? null;
        if (array_key_exists('seriesIndex', $values)) {
            $this->_setField('seriesIndex');
        }
        $this->groupSession = $values['groupSession'] ?? null;
        if (array_key_exists('groupSession', $values)) {
            $this->_setField('groupSession');
        }
        $this->calendarUnverified = $values['calendarUnverified'];
        $this->externalConflictAt = $values['externalConflictAt'] ?? null;
        if (array_key_exists('externalConflictAt', $values)) {
            $this->_setField('externalConflictAt');
        }
        $this->noShowAt = $values['noShowAt'] ?? null;
        if (array_key_exists('noShowAt', $values)) {
            $this->_setField('noShowAt');
        }
        $this->cancelledAt = $values['cancelledAt'] ?? null;
        if (array_key_exists('cancelledAt', $values)) {
            $this->_setField('cancelledAt');
        }
        $this->cancelledBy = $values['cancelledBy'] ?? null;
        if (array_key_exists('cancelledBy', $values)) {
            $this->_setField('cancelledBy');
        }
        $this->cancellationReason = $values['cancellationReason'] ?? null;
        if (array_key_exists('cancellationReason', $values)) {
            $this->_setField('cancellationReason');
        }
        $this->metadata = $values['metadata'];
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
