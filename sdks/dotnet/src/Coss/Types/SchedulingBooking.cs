using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingBooking : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingBookingObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The id of the booked event type.
    /// </summary>
    [JsonPropertyName("event_type")]
    public required string EventType { get; set; }

    /// <summary>
    /// `held`: a hold keeping the slot until `hold_expires_at`, uncharged and known to nobody. `pending_approval`: holds the time until approved, declined or `approval_expires_at`. `confirmed`: booked. `cancelled`: cancelled, or a hold released or expired. `declined`: refused, or its approval deadline passed.
    /// </summary>
    [JsonPropertyName("status")]
    public required SchedulingBookingStatus Status { get; set; }

    /// <summary>
    /// The event type's title when this was booked.
    /// </summary>
    [JsonPropertyName("title")]
    public required string Title { get; set; }

    /// <summary>
    /// When the booking starts.
    /// </summary>
    [JsonPropertyName("start")]
    public required string Start { get; set; }

    /// <summary>
    /// When the booking ends, without buffers.
    /// </summary>
    [JsonPropertyName("end")]
    public required string End { get; set; }

    /// <summary>
    /// The ids of the hosts taking it.
    /// </summary>
    [JsonPropertyName("hosts")]
    public IEnumerable<string> Hosts { get; set; } = new List<string>();

    /// <summary>
    /// Who's booked: the attendee first, then any guests they added. A group session's seat is its own booking.
    /// </summary>
    [JsonPropertyName("attendees")]
    public IEnumerable<SchedulingBookingAttendeesItem> Attendees { get; set; } =
        new List<SchedulingBookingAttendeesItem>();

    [JsonPropertyName("location")]
    public required SchedulingLocation Location { get; set; }

    /// <summary>
    /// When a `held` booking gives up its slot. `null` otherwise.
    /// </summary>
    [Nullable]
    [JsonPropertyName("hold_expires_at")]
    public string? HoldExpiresAt { get; set; }

    /// <summary>
    /// When a `pending_approval` booking is declined if nobody decides. `null` otherwise.
    /// </summary>
    [Nullable]
    [JsonPropertyName("approval_expires_at")]
    public string? ApprovalExpiresAt { get; set; }

    /// <summary>
    /// The id of the series it belongs to. `null`: not part of one.
    /// </summary>
    [Nullable]
    [JsonPropertyName("series")]
    public string? Series { get; set; }

    /// <summary>
    /// Its place in the series, from 0. `null`: not part of one.
    /// </summary>
    [Nullable]
    [JsonPropertyName("series_index")]
    public double? SeriesIndex { get; set; }

    /// <summary>
    /// The id of the group session whose seat this is. `null`: not a seat.
    /// </summary>
    [Nullable]
    [JsonPropertyName("group_session")]
    public string? GroupSession { get; set; }

    /// <summary>
    /// Reserved for flagging a booking made on last known calendar data. Nothing sets it yet, so it's always `false`.
    /// </summary>
    [JsonPropertyName("calendar_unverified")]
    public required bool CalendarUnverified { get; set; }

    /// <summary>
    /// When something else landed on this time in the host's calendar, or the host changed the event. The booking stands. `null`: no conflict known.
    /// </summary>
    [Nullable]
    [JsonPropertyName("external_conflict_at")]
    public string? ExternalConflictAt { get; set; }

    /// <summary>
    /// When the attendee was marked as a no-show. `null`: not marked.
    /// </summary>
    [Nullable]
    [JsonPropertyName("no_show_at")]
    public string? NoShowAt { get; set; }

    /// <summary>
    /// When it was cancelled. `null`: not cancelled.
    /// </summary>
    [Nullable]
    [JsonPropertyName("cancelled_at")]
    public string? CancelledAt { get; set; }

    /// <summary>
    /// Who cancelled it: `api_key`, `user` (the dashboard), `host_session`, `booker_session`, `manage_session` (the attendee's link) or `system`. `null`: not cancelled, or cancelled before this was recorded.
    /// </summary>
    [Nullable]
    [JsonPropertyName("cancelled_by")]
    public SchedulingBookingCancelledBy? CancelledBy { get; set; }

    /// <summary>
    /// Why, if they said. Only when retrieving one booking. It's erased with the attendee's details, and it's never in webhooks, logs or emails.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("cancellation_reason")]
    public Optional<string?> CancellationReason { get; set; }

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
