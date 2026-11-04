using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Scheduling;

[Serializable]
public record UpdateEventTypeRequest
{
    /// <summary>
    /// The event type's id or uid.
    /// </summary>
    [JsonIgnore]
    public required string EventType { get; set; }

    /// <summary>
    /// Your own id for this event type. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("uid")]
    public Optional<string?> Uid { get; set; }

    /// <summary>
    /// Plain text about the event type, shown on hosted booking pages and never in emails. Links, and anything shaped like a domain, must be on your organization's verified domains or their subdomains, and use `https`. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("description")]
    public Optional<string?> Description { get; set; }

    /// <summary>
    /// Shown to attendees and in emails. Host calendars show it only with `host_calendar_details: full`.
    /// </summary>
    [Optional]
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    /// <summary>
    /// How long a booking lasts by default, in minutes.
    /// </summary>
    [Optional]
    [JsonPropertyName("duration_minutes")]
    public int? DurationMinutes { get; set; }

    /// <summary>
    /// Other lengths an attendee may choose, in minutes. Empty: only `duration_minutes`.
    /// </summary>
    [Optional]
    [JsonPropertyName("duration_options")]
    public IEnumerable<int>? DurationOptions { get; set; }

    /// <summary>
    /// How far apart slots start. Default: the duration.
    /// </summary>
    [Optional]
    [JsonPropertyName("step_minutes")]
    public int? StepMinutes { get; set; }

    /// <summary>
    /// The zone slots align in. Default: each host's own.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("grid_time_zone")]
    public Optional<string?> GridTimeZone { get; set; }

    /// <summary>
    /// Minutes kept free before each booking. Default: 0.
    /// </summary>
    [Optional]
    [JsonPropertyName("buffer_before_minutes")]
    public int? BufferBeforeMinutes { get; set; }

    /// <summary>
    /// Minutes kept free after each booking. Default: 0.
    /// </summary>
    [Optional]
    [JsonPropertyName("buffer_after_minutes")]
    public int? BufferAfterMinutes { get; set; }

    /// <summary>
    /// Slots starting sooner than this many minutes from now aren't offered. Default: 0.
    /// </summary>
    [Optional]
    [JsonPropertyName("min_notice_minutes")]
    public int? MinNoticeMinutes { get; set; }

    [Nullable, Optional]
    [JsonPropertyName("booking_window")]
    public Optional<OneOf<
        SchedulingBookingWindowDays,
        SchedulingBookingWindowFrom
    >?> BookingWindow { get; set; }

    /// <summary>
    /// Caps on bookings per day or week. Default: none.
    /// </summary>
    [Optional]
    [JsonPropertyName("limits")]
    public IEnumerable<SchedulingLimit>? Limits { get; set; }

    /// <summary>
    /// Attendees per session. Required for, and only allowed on, `group`.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("capacity")]
    public Optional<int?> Capacity { get; set; }

    /// <summary>
    /// Bookings start as `pending_approval`, holding the time until approved or declined. Default: `false`.
    /// </summary>
    [Optional]
    [JsonPropertyName("requires_approval")]
    public bool? RequiresApproval { get; set; }

    /// <summary>
    /// How long a booking can wait for approval before it's declined, in minutes. Default: 1440.
    /// </summary>
    [Optional]
    [JsonPropertyName("approval_ttl_minutes")]
    public int? ApprovalTtlMinutes { get; set; }

    /// <summary>
    /// How long a hold keeps its slot, in seconds. Default: 600.
    /// </summary>
    [Optional]
    [JsonPropertyName("hold_ttl_seconds")]
    public int? HoldTtlSeconds { get; set; }

    /// <summary>
    /// Attendees can't cancel closer to the start than this. API keys can.
    /// </summary>
    [Optional]
    [JsonPropertyName("cancel_notice_minutes")]
    public int? CancelNoticeMinutes { get; set; }

    /// <summary>
    /// Attendees can't reschedule closer to the start than this. API keys can. Default: 0.
    /// </summary>
    [Optional]
    [JsonPropertyName("reschedule_notice_minutes")]
    public int? RescheduleNoticeMinutes { get; set; }

    /// <summary>
    /// How many people an attendee can add to a booking. Default: 0. Guests are emailed about it. Not on `group`.
    /// </summary>
    [Optional]
    [JsonPropertyName("max_guests")]
    public int? MaxGuests { get; set; }

    /// <summary>
    /// How many upcoming bookings of this event type one person can have at a time, known by `uid` or email. Default: `null`, no limit. Past this, booking answers `attendee_limit_reached`. Guests don't count, and each occurrence of a series does.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("max_active_bookings_per_attendee")]
    public Optional<int?> MaxActiveBookingsPerAttendee { get; set; }

    /// <summary>
    /// What hosts' calendars say about a booking. `neutral` (the default): a private event titled "Appointment". `full`: a private event with this title and the attendee's name, plus names, emails and phone numbers in its description, which go to the host's calendar provider. Never answers. Refused in HIPAA mode.
    /// </summary>
    [Optional]
    [JsonPropertyName("host_calendar_details")]
    public UpdateEventTypeRequestHostCalendarDetails? HostCalendarDetails { get; set; }

    /// <summary>
    /// What attendees are asked when booking. Keys must be unique.
    /// </summary>
    [Optional]
    [JsonPropertyName("questions")]
    public IEnumerable<SchedulingQuestion>? Questions { get; set; }

    /// <summary>
    /// Where bookings can meet. A browser only chooses among these. A `group` event type can't use `zoom`.
    /// </summary>
    [Optional]
    [JsonPropertyName("locations")]
    public IEnumerable<SchedulingLocation>? Locations { get; set; }

    /// <summary>
    /// Pool members also include active hosts matching all of these attributes.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("host_filter")]
    public Optional<Dictionary<
        string,
        OneOf<string, IEnumerable<string>>?
    >?> HostFilter { get; set; }

    /// <summary>
    /// Per event, overriding your settings for this event type.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("notifications")]
    public Optional<Dictionary<
        string,
        UpdateEventTypeRequestNotificationsValue?
    >?> Notifications { get; set; }

    /// <summary>
    /// Replaces your settings' `reminders` for this event type. `null` inherits them; an empty list means none.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("reminders")]
    public Optional<IEnumerable<SchedulingReminderInput>?> Reminders { get; set; }

    /// <summary>
    /// Your own key-value pairs.
    /// </summary>
    [Optional]
    [JsonPropertyName("metadata")]
    public Dictionary<string, string>? Metadata { get; set; }

    /// <summary>
    /// `archived` stops new bookings, and keeps existing ones.
    /// </summary>
    [Optional]
    [JsonPropertyName("status")]
    public UpdateEventTypeRequestStatus? Status { get; set; }

    /// <summary>
    /// Replaces the assigned hosts. Removed hosts keep their existing bookings.
    /// </summary>
    [Optional]
    [JsonPropertyName("hosts")]
    public IEnumerable<SchedulingEventTypeHostInput>? Hosts { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
