using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

[Serializable]
public record SchedulingEventType : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingEventTypeObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// Your own id for this event type, accepted wherever its id is. `null` when none is set.
    /// </summary>
    [Nullable]
    [JsonPropertyName("uid")]
    public string? Uid { get; set; }

    /// <summary>
    /// Plain text shown on hosted booking pages. `null` when there's none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    /// <summary>
    /// Shown to attendees and in emails. Host calendars show it only with `host_calendar_details: full`.
    /// </summary>
    [JsonPropertyName("title")]
    public required string Title { get; set; }

    /// <summary>
    /// Who a booking needs. `one_on_one`: one host. `pool`: any one of its hosts. `collective`: every `required` host, plus at most one `member`. `group`: one host, with attendees taking seats up to `capacity`.
    /// </summary>
    [JsonPropertyName("kind")]
    public required SchedulingEventTypeKind Kind { get; set; }

    /// <summary>
    /// `active`: can be booked. `archived`: new bookings answer `not_found`; existing ones stay.
    /// </summary>
    [JsonPropertyName("status")]
    public required SchedulingEventTypeStatus Status { get; set; }

    /// <summary>
    /// How long a booking lasts by default, in minutes.
    /// </summary>
    [JsonPropertyName("duration_minutes")]
    public required double DurationMinutes { get; set; }

    /// <summary>
    /// Other lengths an attendee may choose, in minutes. Empty: only `duration_minutes`.
    /// </summary>
    [JsonPropertyName("duration_options")]
    public IEnumerable<double> DurationOptions { get; set; } = new List<double>();

    /// <summary>
    /// How far apart slots start, in minutes.
    /// </summary>
    [JsonPropertyName("step_minutes")]
    public required double StepMinutes { get; set; }

    /// <summary>
    /// The zone slots align in. `null`: each host's own.
    /// </summary>
    [Nullable]
    [JsonPropertyName("grid_time_zone")]
    public string? GridTimeZone { get; set; }

    /// <summary>
    /// Minutes kept free before each booking.
    /// </summary>
    [JsonPropertyName("buffer_before_minutes")]
    public required double BufferBeforeMinutes { get; set; }

    /// <summary>
    /// Minutes kept free after each booking.
    /// </summary>
    [JsonPropertyName("buffer_after_minutes")]
    public required double BufferAfterMinutes { get; set; }

    /// <summary>
    /// Slots starting sooner than this many minutes from now aren't offered.
    /// </summary>
    [JsonPropertyName("min_notice_minutes")]
    public required double MinNoticeMinutes { get; set; }

    [Nullable]
    [JsonPropertyName("booking_window")]
    public OneOf<
        SchedulingBookingWindowDays,
        SchedulingBookingWindowFrom
    >? BookingWindow { get; set; }

    /// <summary>
    /// Caps on bookings per day or week.
    /// </summary>
    [JsonPropertyName("limits")]
    public IEnumerable<SchedulingLimit> Limits { get; set; } = new List<SchedulingLimit>();

    /// <summary>
    /// Attendees per session of a `group` event type. `null` for every other kind.
    /// </summary>
    [Nullable]
    [JsonPropertyName("capacity")]
    public double? Capacity { get; set; }

    /// <summary>
    /// Whether bookings start as `pending_approval`, holding the time until approved or declined.
    /// </summary>
    [JsonPropertyName("requires_approval")]
    public required bool RequiresApproval { get; set; }

    /// <summary>
    /// How long a booking can wait for approval before it's declined, in minutes.
    /// </summary>
    [JsonPropertyName("approval_ttl_minutes")]
    public required double ApprovalTtlMinutes { get; set; }

    /// <summary>
    /// How long a hold keeps its slot, in seconds.
    /// </summary>
    [JsonPropertyName("hold_ttl_seconds")]
    public required double HoldTtlSeconds { get; set; }

    /// <summary>
    /// Attendees can't cancel closer to the start than this. API keys can.
    /// </summary>
    [JsonPropertyName("cancel_notice_minutes")]
    public required double CancelNoticeMinutes { get; set; }

    /// <summary>
    /// Attendees can't reschedule closer to the start than this. API keys can.
    /// </summary>
    [JsonPropertyName("reschedule_notice_minutes")]
    public required double RescheduleNoticeMinutes { get; set; }

    /// <summary>
    /// How many people an attendee can add to a booking. Not on `group`.
    /// </summary>
    [JsonPropertyName("max_guests")]
    public required double MaxGuests { get; set; }

    /// <summary>
    /// How many upcoming bookings of this event type one person can have at a time. `null`: no limit.
    /// </summary>
    [Nullable]
    [JsonPropertyName("max_active_bookings_per_attendee")]
    public double? MaxActiveBookingsPerAttendee { get; set; }

    /// <summary>
    /// What hosts' calendars say about a booking. `neutral`: a private event titled "Appointment". `full`: a private event with this title and the attendee's and guests' details.
    /// </summary>
    [JsonPropertyName("host_calendar_details")]
    public required SchedulingEventTypeHostCalendarDetails HostCalendarDetails { get; set; }

    /// <summary>
    /// What attendees are asked when booking.
    /// </summary>
    [JsonPropertyName("questions")]
    public IEnumerable<SchedulingQuestion> Questions { get; set; } = new List<SchedulingQuestion>();

    /// <summary>
    /// Where bookings can meet. A browser only chooses among these.
    /// </summary>
    [JsonPropertyName("locations")]
    public IEnumerable<SchedulingLocation> Locations { get; set; } = new List<SchedulingLocation>();

    /// <summary>
    /// Pool members also include active hosts matching all of these attributes. `null`: only `hosts`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("host_filter")]
    public Dictionary<string, OneOf<string, IEnumerable<string>>?>? HostFilter { get; set; }

    /// <summary>
    /// Per event, overriding your settings for this event type. `null`: only those.
    /// </summary>
    [Nullable]
    [JsonPropertyName("notifications")]
    public Dictionary<string, SchedulingEventTypeNotificationsValue?>? Notifications { get; set; }

    /// <summary>
    /// What goes out around a booking, in place of your settings' list. `null` inherits it; an empty list means none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("reminders")]
    public IEnumerable<SchedulingReminder>? Reminders { get; set; }

    /// <summary>
    /// The hosts assigned by name.
    /// </summary>
    [JsonPropertyName("hosts")]
    public IEnumerable<SchedulingEventTypeHostsItem> Hosts { get; set; } =
        new List<SchedulingEventTypeHostsItem>();

    /// <summary>
    /// Your own key-value pairs.
    /// </summary>
    [JsonPropertyName("metadata")]
    public Dictionary<string, string> Metadata { get; set; } = new Dictionary<string, string>();

    [JsonPropertyName("created_at")]
    public required string CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required string UpdatedAt { get; set; }

    [JsonIgnore]
    public ReadOnlyAdditionalProperties AdditionalProperties { get; private set; } = new();

    void IJsonOnDeserialized.OnDeserialized() =>
        AdditionalProperties.CopyFromExtensionData(_extensionData);

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
