<?php

namespace Coss\Scheduling\EventTypes\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Scheduling\EventTypes\Types\CreateEventTypeRequestKind;
use Coss\Core\Types\ArrayType;
use Coss\Types\SchedulingBookingWindowDays;
use Coss\Types\SchedulingBookingWindowFrom;
use Coss\Core\Types\Union;
use Coss\Types\SchedulingLimit;
use Coss\Scheduling\EventTypes\Types\CreateEventTypeRequestHostCalendarDetails;
use Coss\Types\SchedulingQuestion;
use Coss\Types\SchedulingLocation;
use Coss\Scheduling\EventTypes\Types\CreateEventTypeRequestNotificationsValue;
use Coss\Types\SchedulingReminderInput;
use Coss\Types\SchedulingEventTypeHostInput;

class CreateEventTypeRequest extends JsonSerializableType
{
    /**
     * @var ?string $uid Your own id for this event type, unique in the environment, accepted wherever its id is.
     */
    #[JsonProperty('uid')]
    public ?string $uid;

    /**
     * @var ?value-of<CreateEventTypeRequestKind> $kind Who a booking needs. `one_on_one`: one host. `pool`: any one of its hosts. `collective`: every `required` host, plus at most one `member`. `group`: one host, with attendees taking seats up to `capacity`. Fixed once created.
     */
    #[JsonProperty('kind')]
    public ?string $kind;

    /**
     * @var ?string $description Plain text about the event type, shown on hosted booking pages and never in emails. Links, and anything shaped like a domain, must be on your organization's verified domains or their subdomains, and use `https`. `null` removes it.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var string $title Shown to attendees and in emails. Host calendars show it only with `host_calendar_details: full`.
     */
    #[JsonProperty('title')]
    public string $title;

    /**
     * @var int $durationMinutes How long a booking lasts by default, in minutes.
     */
    #[JsonProperty('duration_minutes')]
    public int $durationMinutes;

    /**
     * @var ?array<int> $durationOptions Other lengths an attendee may choose, in minutes. Empty: only `duration_minutes`.
     */
    #[JsonProperty('duration_options'), ArrayType(['integer'])]
    public ?array $durationOptions;

    /**
     * @var ?int $stepMinutes How far apart slots start. Default: the duration.
     */
    #[JsonProperty('step_minutes')]
    public ?int $stepMinutes;

    /**
     * @var ?string $gridTimeZone The zone slots align in. Default: each host's own.
     */
    #[JsonProperty('grid_time_zone')]
    public ?string $gridTimeZone;

    /**
     * @var ?int $bufferBeforeMinutes Minutes kept free before each booking. Default: 0.
     */
    #[JsonProperty('buffer_before_minutes')]
    public ?int $bufferBeforeMinutes;

    /**
     * @var ?int $bufferAfterMinutes Minutes kept free after each booking. Default: 0.
     */
    #[JsonProperty('buffer_after_minutes')]
    public ?int $bufferAfterMinutes;

    /**
     * @var ?int $minNoticeMinutes Slots starting sooner than this many minutes from now aren't offered. Default: 0.
     */
    #[JsonProperty('min_notice_minutes')]
    public ?int $minNoticeMinutes;

    /**
     * @var (
     *    SchedulingBookingWindowDays
     *   |SchedulingBookingWindowFrom
     * )|null $bookingWindow
     */
    #[JsonProperty('booking_window'), Union(SchedulingBookingWindowDays::class, SchedulingBookingWindowFrom::class, 'null')]
    public SchedulingBookingWindowDays|SchedulingBookingWindowFrom|null $bookingWindow;

    /**
     * @var ?array<SchedulingLimit> $limits Caps on bookings per day or week. Default: none.
     */
    #[JsonProperty('limits'), ArrayType([SchedulingLimit::class])]
    public ?array $limits;

    /**
     * @var ?int $capacity Attendees per session. Required for, and only allowed on, `group`.
     */
    #[JsonProperty('capacity')]
    public ?int $capacity;

    /**
     * @var ?bool $requiresApproval Bookings start as `pending_approval`, holding the time until approved or declined. Default: `false`.
     */
    #[JsonProperty('requires_approval')]
    public ?bool $requiresApproval;

    /**
     * @var ?int $approvalTtlMinutes How long a booking can wait for approval before it's declined, in minutes. Default: 1440.
     */
    #[JsonProperty('approval_ttl_minutes')]
    public ?int $approvalTtlMinutes;

    /**
     * @var ?int $holdTtlSeconds How long a hold keeps its slot, in seconds. Default: 600.
     */
    #[JsonProperty('hold_ttl_seconds')]
    public ?int $holdTtlSeconds;

    /**
     * @var ?int $cancelNoticeMinutes Attendees can't cancel closer to the start than this. API keys can.
     */
    #[JsonProperty('cancel_notice_minutes')]
    public ?int $cancelNoticeMinutes;

    /**
     * @var ?int $rescheduleNoticeMinutes Attendees can't reschedule closer to the start than this. API keys can. Default: 0.
     */
    #[JsonProperty('reschedule_notice_minutes')]
    public ?int $rescheduleNoticeMinutes;

    /**
     * @var ?int $maxGuests How many people an attendee can add to a booking. Default: 0. Guests are emailed about it. Not on `group`.
     */
    #[JsonProperty('max_guests')]
    public ?int $maxGuests;

    /**
     * @var ?int $maxActiveBookingsPerAttendee How many upcoming bookings of this event type one person can have at a time, known by `uid` or email. Default: `null`, no limit. Past this, booking answers `attendee_limit_reached`. Guests don't count, and each occurrence of a series does.
     */
    #[JsonProperty('max_active_bookings_per_attendee')]
    public ?int $maxActiveBookingsPerAttendee;

    /**
     * @var ?value-of<CreateEventTypeRequestHostCalendarDetails> $hostCalendarDetails What hosts' calendars say about a booking. `neutral` (the default): a private event titled "Appointment". `full`: a private event with this title and the attendee's name, plus names, emails and phone numbers in its description, which go to the host's calendar provider. Never answers. Refused in HIPAA mode.
     */
    #[JsonProperty('host_calendar_details')]
    public ?string $hostCalendarDetails;

    /**
     * @var ?array<SchedulingQuestion> $questions What attendees are asked when booking. Keys must be unique.
     */
    #[JsonProperty('questions'), ArrayType([SchedulingQuestion::class])]
    public ?array $questions;

    /**
     * @var ?array<SchedulingLocation> $locations Where bookings can meet. A browser only chooses among these. A `group` event type can't use `zoom`.
     */
    #[JsonProperty('locations'), ArrayType([SchedulingLocation::class])]
    public ?array $locations;

    /**
     * @var ?array<string, (
     *    string
     *   |array<string>
     * )|null> $hostFilter Pool members also include active hosts matching all of these attributes.
     */
    #[JsonProperty('host_filter'), ArrayType(['string' => new Union(new Union('string', ['string']), 'null')])]
    public ?array $hostFilter;

    /**
     * @var ?array<string, ?CreateEventTypeRequestNotificationsValue> $notifications Per event, overriding your settings for this event type.
     */
    #[JsonProperty('notifications'), ArrayType(['string' => new Union(CreateEventTypeRequestNotificationsValue::class, 'null')])]
    public ?array $notifications;

    /**
     * @var ?array<SchedulingReminderInput> $reminders Replaces your settings' `reminders` for this event type. `null` inherits them; an empty list means none.
     */
    #[JsonProperty('reminders'), ArrayType([SchedulingReminderInput::class])]
    public ?array $reminders;

    /**
     * @var ?array<string, string> $metadata Your own key-value pairs.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public ?array $metadata;

    /**
     * @var ?array<SchedulingEventTypeHostInput> $hosts Who can be booked. `one_on_one` and `group` take one; `collective` needs at least one `required` host.
     */
    #[JsonProperty('hosts'), ArrayType([SchedulingEventTypeHostInput::class])]
    public ?array $hosts;

    /**
     * @param array{
     *   title: string,
     *   durationMinutes: int,
     *   uid?: ?string,
     *   kind?: ?value-of<CreateEventTypeRequestKind>,
     *   description?: ?string,
     *   durationOptions?: ?array<int>,
     *   stepMinutes?: ?int,
     *   gridTimeZone?: ?string,
     *   bufferBeforeMinutes?: ?int,
     *   bufferAfterMinutes?: ?int,
     *   minNoticeMinutes?: ?int,
     *   bookingWindow?: (
     *    SchedulingBookingWindowDays
     *   |SchedulingBookingWindowFrom
     * )|null,
     *   limits?: ?array<SchedulingLimit>,
     *   capacity?: ?int,
     *   requiresApproval?: ?bool,
     *   approvalTtlMinutes?: ?int,
     *   holdTtlSeconds?: ?int,
     *   cancelNoticeMinutes?: ?int,
     *   rescheduleNoticeMinutes?: ?int,
     *   maxGuests?: ?int,
     *   maxActiveBookingsPerAttendee?: ?int,
     *   hostCalendarDetails?: ?value-of<CreateEventTypeRequestHostCalendarDetails>,
     *   questions?: ?array<SchedulingQuestion>,
     *   locations?: ?array<SchedulingLocation>,
     *   hostFilter?: ?array<string, (
     *    string
     *   |array<string>
     * )|null>,
     *   notifications?: ?array<string, ?CreateEventTypeRequestNotificationsValue>,
     *   reminders?: ?array<SchedulingReminderInput>,
     *   metadata?: ?array<string, string>,
     *   hosts?: ?array<SchedulingEventTypeHostInput>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->uid = $values['uid'] ?? null;
        if (array_key_exists('uid', $values)) {
            $this->_setField('uid');
        }
        $this->kind = $values['kind'] ?? null;
        if (array_key_exists('kind', $values)) {
            $this->_setField('kind');
        }
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->title = $values['title'];
        $this->durationMinutes = $values['durationMinutes'];
        $this->durationOptions = $values['durationOptions'] ?? null;
        if (array_key_exists('durationOptions', $values)) {
            $this->_setField('durationOptions');
        }
        $this->stepMinutes = $values['stepMinutes'] ?? null;
        if (array_key_exists('stepMinutes', $values)) {
            $this->_setField('stepMinutes');
        }
        $this->gridTimeZone = $values['gridTimeZone'] ?? null;
        if (array_key_exists('gridTimeZone', $values)) {
            $this->_setField('gridTimeZone');
        }
        $this->bufferBeforeMinutes = $values['bufferBeforeMinutes'] ?? null;
        if (array_key_exists('bufferBeforeMinutes', $values)) {
            $this->_setField('bufferBeforeMinutes');
        }
        $this->bufferAfterMinutes = $values['bufferAfterMinutes'] ?? null;
        if (array_key_exists('bufferAfterMinutes', $values)) {
            $this->_setField('bufferAfterMinutes');
        }
        $this->minNoticeMinutes = $values['minNoticeMinutes'] ?? null;
        if (array_key_exists('minNoticeMinutes', $values)) {
            $this->_setField('minNoticeMinutes');
        }
        $this->bookingWindow = $values['bookingWindow'] ?? null;
        if (array_key_exists('bookingWindow', $values)) {
            $this->_setField('bookingWindow');
        }
        $this->limits = $values['limits'] ?? null;
        if (array_key_exists('limits', $values)) {
            $this->_setField('limits');
        }
        $this->capacity = $values['capacity'] ?? null;
        if (array_key_exists('capacity', $values)) {
            $this->_setField('capacity');
        }
        $this->requiresApproval = $values['requiresApproval'] ?? null;
        if (array_key_exists('requiresApproval', $values)) {
            $this->_setField('requiresApproval');
        }
        $this->approvalTtlMinutes = $values['approvalTtlMinutes'] ?? null;
        if (array_key_exists('approvalTtlMinutes', $values)) {
            $this->_setField('approvalTtlMinutes');
        }
        $this->holdTtlSeconds = $values['holdTtlSeconds'] ?? null;
        if (array_key_exists('holdTtlSeconds', $values)) {
            $this->_setField('holdTtlSeconds');
        }
        $this->cancelNoticeMinutes = $values['cancelNoticeMinutes'] ?? null;
        if (array_key_exists('cancelNoticeMinutes', $values)) {
            $this->_setField('cancelNoticeMinutes');
        }
        $this->rescheduleNoticeMinutes = $values['rescheduleNoticeMinutes'] ?? null;
        if (array_key_exists('rescheduleNoticeMinutes', $values)) {
            $this->_setField('rescheduleNoticeMinutes');
        }
        $this->maxGuests = $values['maxGuests'] ?? null;
        if (array_key_exists('maxGuests', $values)) {
            $this->_setField('maxGuests');
        }
        $this->maxActiveBookingsPerAttendee = $values['maxActiveBookingsPerAttendee'] ?? null;
        if (array_key_exists('maxActiveBookingsPerAttendee', $values)) {
            $this->_setField('maxActiveBookingsPerAttendee');
        }
        $this->hostCalendarDetails = $values['hostCalendarDetails'] ?? null;
        if (array_key_exists('hostCalendarDetails', $values)) {
            $this->_setField('hostCalendarDetails');
        }
        $this->questions = $values['questions'] ?? null;
        if (array_key_exists('questions', $values)) {
            $this->_setField('questions');
        }
        $this->locations = $values['locations'] ?? null;
        if (array_key_exists('locations', $values)) {
            $this->_setField('locations');
        }
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
        $this->metadata = $values['metadata'] ?? null;
        if (array_key_exists('metadata', $values)) {
            $this->_setField('metadata');
        }
        $this->hosts = $values['hosts'] ?? null;
        if (array_key_exists('hosts', $values)) {
            $this->_setField('hosts');
        }
    }
}
