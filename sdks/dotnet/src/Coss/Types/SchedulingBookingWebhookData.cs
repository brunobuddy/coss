using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Ids, times and statuses only. Retrieve the booking for anything about the person.
/// </summary>
[Serializable]
public record SchedulingBookingWebhookData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The booking's id.
    /// </summary>
    [JsonPropertyName("booking_id")]
    public required string BookingId { get; set; }

    /// <summary>
    /// The booked event type's id.
    /// </summary>
    [JsonPropertyName("event_type_id")]
    public required string EventTypeId { get; set; }

    /// <summary>
    /// The booking's status after this event.
    /// </summary>
    [JsonPropertyName("status")]
    public required SchedulingBookingWebhookDataStatus Status { get; set; }

    /// <summary>
    /// When the booking starts.
    /// </summary>
    [JsonPropertyName("start")]
    public required string Start { get; set; }

    /// <summary>
    /// When the booking ends.
    /// </summary>
    [JsonPropertyName("end")]
    public required string End { get; set; }

    /// <summary>
    /// The ids of the hosts taking it.
    /// </summary>
    [JsonPropertyName("host_ids")]
    public IEnumerable<string> HostIds { get; set; } = new List<string>();

    /// <summary>
    /// Your uids of its attendees.
    /// </summary>
    [JsonPropertyName("attendee_uids")]
    public IEnumerable<string> AttendeeUids { get; set; } = new List<string>();

    /// <summary>
    /// The id of its series. `null`: not part of one.
    /// </summary>
    [Nullable]
    [JsonPropertyName("series_id")]
    public string? SeriesId { get; set; }

    /// <summary>
    /// `scheduling.booking.rescheduled`: when it used to start.
    /// </summary>
    [Optional]
    [JsonPropertyName("previous_start")]
    public string? PreviousStart { get; set; }

    /// <summary>
    /// `scheduling.booking.reminder`: which reminder this is.
    /// </summary>
    [Optional]
    [JsonPropertyName("reminder")]
    public SchedulingBookingWebhookDataReminder? Reminder { get; set; }

    /// <summary>
    /// When this happened.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required string OccurredAt { get; set; }

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
