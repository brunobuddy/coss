<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;

class SchedulingEventType extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingEventTypeObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var ?string $uid Your own id for this event type, accepted wherever its id is. `null` when none is set.
     */
    #[JsonProperty('uid')]
    public ?string $uid;

    /**
     * @var ?string $description Plain text shown on hosted booking pages. `null` when there's none.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var string $title Shown to attendees and in emails. Host calendars show it only with `host_calendar_details: full`.
     */
    #[JsonProperty('title')]
    public string $title;

    /**
     * @var value-of<SchedulingEventTypeKind> $kind Who a booking needs. `one_on_one`: one host. `pool`: any one of its hosts. `collective`: every `required` host, plus at most one `member`. `group`: one host, with attendees taking seats up to `capacity`.
     */
    #[JsonProperty('kind')]
    public string $kind;

    /**
     * @var value-of<SchedulingEventTypeStatus> $status `active`: can be booked. `archived`: new bookings answer `not_found`; existing ones stay.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var float $durationMinutes How long a booking lasts by default, in minutes.
     */
    #[JsonProperty('duration_minutes')]
    public float $durationMinutes;

    /**
     * @var array<float> $durationOptions Other lengths an attendee may choose, in minutes. Empty: only `duration_minutes`.
     */
    #[JsonProperty('duration_options'), ArrayType(['float'])]
    public array $durationOptions;

    /**
     * @var float $stepMinutes How far apart slots start, in minutes.
     */
    #[JsonProperty('step_minutes')]
    public float $stepMinutes;

    /**
     * @var ?string $gridTimeZone The zone slots align in. `null`: each host's own.
     */
    #[JsonProperty('grid_time_zone')]
    public ?string $gridTimeZone;

    /**
     * @var float $bufferBeforeMinutes Minutes kept free before each booking.
     */
    #[JsonProperty('buffer_before_minutes')]
    public float $bufferBeforeMinutes;

    /**
     * @var float $bufferAfterMinutes Minutes kept free after each booking.
     */
    #[JsonProperty('buffer_after_minutes')]
    public float $bufferAfterMinutes;

    /**
     * @var float $minNoticeMinutes Slots starting sooner than this many minutes from now aren't offered.
     */
    #[JsonProperty('min_notice_minutes')]
    public float $minNoticeMinutes;

    /**
     * @var (
     *    SchedulingBookingWindowDays
     *   |SchedulingBookingWindowFrom
     * )|null $bookingWindow
     */
    #[JsonProperty('booking_window'), Union(SchedulingBookingWindowDays::class, SchedulingBookingWindowFrom::class, 'null')]
    public SchedulingBookingWindowDays|SchedulingBookingWindowFrom|null $bookingWindow;

    /**
     * @var array<SchedulingLimit> $limits Caps on bookings per day or week.
     */
    #[JsonProperty('limits'), ArrayType([SchedulingLimit::class])]
    public array $limits;

    /**
     * @var ?float $capacity Attendees per session of a `group` event type. `null` for every other kind.
     */
    #[JsonProperty('capacity')]
    public ?float $capacity;

    /**
     * @var bool $requiresApproval Whether bookings start as `pending_approval`, holding the time until approved or declined.
     */
    #[JsonProperty('requires_approval')]
    public bool $requiresApproval;

    /**
     * @var float $approvalTtlMinutes How long a booking can wait for approval before it's declined, in minutes.
     */
    #[JsonProperty('approval_ttl_minutes')]
    public float $approvalTtlMinutes;

    /**
     * @var float $holdTtlSeconds How long a hold keeps its slot, in seconds.
     */
    #[JsonProperty('hold_ttl_seconds')]
    public float $holdTtlSeconds;

    /**
     * @var float $cancelNoticeMinutes Attendees can't cancel closer to the start than this. API keys can.
     */
    #[JsonProperty('cancel_notice_minutes')]
    public float $cancelNoticeMinutes;

    /**
     * @var float $rescheduleNoticeMinutes Attendees can't reschedule closer to the start than this. API keys can.
     */
    #[JsonProperty('reschedule_notice_minutes')]
    public float $rescheduleNoticeMinutes;

    /**
     * @var float $maxGuests How many people an attendee can add to a booking. Not on `group`.
     */
    #[JsonProperty('max_guests')]
    public float $maxGuests;

    /**
     * @var ?float $maxActiveBookingsPerAttendee How many upcoming bookings of this event type one person can have at a time. `null`: no limit.
     */
    #[JsonProperty('max_active_bookings_per_attendee')]
    public ?float $maxActiveBookingsPerAttendee;

    /**
     * @var value-of<SchedulingEventTypeHostCalendarDetails> $hostCalendarDetails What hosts' calendars say about a booking. `neutral`: a private event titled "Appointment". `full`: a private event with this title and the attendee's and guests' details.
     */
    #[JsonProperty('host_calendar_details')]
    public string $hostCalendarDetails;

    /**
     * @var array<SchedulingQuestion> $questions What attendees are asked when booking.
     */
    #[JsonProperty('questions'), ArrayType([SchedulingQuestion::class])]
    public array $questions;

    /**
     * @var array<SchedulingLocation> $locations Where bookings can meet. A browser only chooses among these.
     */
    #[JsonProperty('locations'), ArrayType([SchedulingLocation::class])]
    public array $locations;

    /**
     * @var ?array<string, (
     *    string
     *   |array<string>
     * )|null> $hostFilter Pool members also include active hosts matching all of these attributes. `null`: only `hosts`.
     */
    #[JsonProperty('host_filter'), ArrayType(['string' => new Union(new Union('string', ['string']), 'null')])]
    public ?array $hostFilter;

    /**
     * @var ?array<string, ?SchedulingEventTypeNotificationsValue> $notifications Per event, overriding your settings for this event type. `null`: only those.
     */
    #[JsonProperty('notifications'), ArrayType(['string' => new Union(SchedulingEventTypeNotificationsValue::class, 'null')])]
    public ?array $notifications;

    /**
     * @var ?array<SchedulingReminder> $reminders What goes out around a booking, in place of your settings' list. `null` inherits it; an empty list means none.
     */
    #[JsonProperty('reminders'), ArrayType([SchedulingReminder::class])]
    public ?array $reminders;

    /**
     * @var array<SchedulingEventTypeHostsItem> $hosts The hosts assigned by name.
     */
    #[JsonProperty('hosts'), ArrayType([SchedulingEventTypeHostsItem::class])]
    public array $hosts;

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
     *   object: value-of<SchedulingEventTypeObject>,
     *   id: string,
     *   title: string,
     *   kind: value-of<SchedulingEventTypeKind>,
     *   status: value-of<SchedulingEventTypeStatus>,
     *   durationMinutes: float,
     *   durationOptions: array<float>,
     *   stepMinutes: float,
     *   bufferBeforeMinutes: float,
     *   bufferAfterMinutes: float,
     *   minNoticeMinutes: float,
     *   limits: array<SchedulingLimit>,
     *   requiresApproval: bool,
     *   approvalTtlMinutes: float,
     *   holdTtlSeconds: float,
     *   cancelNoticeMinutes: float,
     *   rescheduleNoticeMinutes: float,
     *   maxGuests: float,
     *   hostCalendarDetails: value-of<SchedulingEventTypeHostCalendarDetails>,
     *   questions: array<SchedulingQuestion>,
     *   locations: array<SchedulingLocation>,
     *   hosts: array<SchedulingEventTypeHostsItem>,
     *   metadata: array<string, string>,
     *   createdAt: string,
     *   updatedAt: string,
     *   uid?: ?string,
     *   description?: ?string,
     *   gridTimeZone?: ?string,
     *   bookingWindow?: (
     *    SchedulingBookingWindowDays
     *   |SchedulingBookingWindowFrom
     * )|null,
     *   capacity?: ?float,
     *   maxActiveBookingsPerAttendee?: ?float,
     *   hostFilter?: ?array<string, (
     *    string
     *   |array<string>
     * )|null>,
     *   notifications?: ?array<string, ?SchedulingEventTypeNotificationsValue>,
     *   reminders?: ?array<SchedulingReminder>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->uid = $values['uid'] ?? null;
        if (array_key_exists('uid', $values)) {
            $this->_setField('uid');
        }
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->title = $values['title'];
        $this->kind = $values['kind'];
        $this->status = $values['status'];
        $this->durationMinutes = $values['durationMinutes'];
        $this->durationOptions = $values['durationOptions'];
        $this->stepMinutes = $values['stepMinutes'];
        $this->gridTimeZone = $values['gridTimeZone'] ?? null;
        if (array_key_exists('gridTimeZone', $values)) {
            $this->_setField('gridTimeZone');
        }
        $this->bufferBeforeMinutes = $values['bufferBeforeMinutes'];
        $this->bufferAfterMinutes = $values['bufferAfterMinutes'];
        $this->minNoticeMinutes = $values['minNoticeMinutes'];
        $this->bookingWindow = $values['bookingWindow'] ?? null;
        if (array_key_exists('bookingWindow', $values)) {
            $this->_setField('bookingWindow');
        }
        $this->limits = $values['limits'];
        $this->capacity = $values['capacity'] ?? null;
        if (array_key_exists('capacity', $values)) {
            $this->_setField('capacity');
        }
        $this->requiresApproval = $values['requiresApproval'];
        $this->approvalTtlMinutes = $values['approvalTtlMinutes'];
        $this->holdTtlSeconds = $values['holdTtlSeconds'];
        $this->cancelNoticeMinutes = $values['cancelNoticeMinutes'];
        $this->rescheduleNoticeMinutes = $values['rescheduleNoticeMinutes'];
        $this->maxGuests = $values['maxGuests'];
        $this->maxActiveBookingsPerAttendee = $values['maxActiveBookingsPerAttendee'] ?? null;
        if (array_key_exists('maxActiveBookingsPerAttendee', $values)) {
            $this->_setField('maxActiveBookingsPerAttendee');
        }
        $this->hostCalendarDetails = $values['hostCalendarDetails'];
        $this->questions = $values['questions'];
        $this->locations = $values['locations'];
        $this->hostFilter = $values['hostFilter'] ?? null;
        if (array_key_exists('hostFilter', $values)) {
            $this->_setField('hostFilter');
        }
        $this->notifications = $values['notifications'] ?? null;
        if (array_key_exists('notifications', $values)) {
            $this->_setField('notifications');
        }
        $this->reminders = $values['reminders'] ?? null;
        if (array_key_exists('reminders', $values)) {
            $this->_setField('reminders');
        }
        $this->hosts = $values['hosts'];
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
