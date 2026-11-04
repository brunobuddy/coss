using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

[Serializable]
public record CreateSeriesRequest : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The event type's id or uid.
    /// </summary>
    [JsonPropertyName("event_type")]
    public required string EventType { get; set; }

    /// <summary>
    /// An ISO 8601 instant with an offset.
    /// </summary>
    [JsonPropertyName("start")]
    public required string Start { get; set; }

    /// <summary>
    /// A specific host (id or uid). Default: chosen fairly from those free.
    /// </summary>
    [Optional]
    [JsonPropertyName("host")]
    public string? Host { get; set; }

    /// <summary>
    /// Only choose among pool hosts matching all of these.
    /// </summary>
    [Optional]
    [JsonPropertyName("attributes")]
    public Dictionary<string, OneOf<string, IEnumerable<string>>>? Attributes { get; set; }

    /// <summary>
    /// One of the event type's `duration_options`.
    /// </summary>
    [Optional]
    [JsonPropertyName("duration_minutes")]
    public int? DurationMinutes { get; set; }

    [JsonPropertyName("attendee")]
    public required SchedulingAttendeeInput Attendee { get; set; }

    /// <summary>
    /// Up to the event type's `max_guests`.
    /// </summary>
    [Optional]
    [JsonPropertyName("guests")]
    public IEnumerable<SchedulingGuestInput>? Guests { get; set; }

    /// <summary>
    /// Answers to the event type's questions. Stored encrypted, and returned only by retrieving the booking.
    /// </summary>
    [Optional]
    [JsonPropertyName("answers")]
    public Dictionary<string, OneOf<string, IEnumerable<string>>>? Answers { get; set; }

    /// <summary>
    /// One of the event type's `locations`, with your link filled in if it has none.
    /// </summary>
    [Optional]
    [JsonPropertyName("location")]
    public CreateSeriesRequestLocation? Location { get; set; }

    /// <summary>
    /// Your own key-value pairs. Don't put sensitive data here.
    /// </summary>
    [Optional]
    [JsonPropertyName("metadata")]
    public Dictionary<string, string>? Metadata { get; set; }

    /// <summary>
    /// How often the booking repeats, at the attendee's local time.
    /// </summary>
    [JsonPropertyName("recurrence")]
    public required CreateSeriesRequestRecurrence Recurrence { get; set; }

    /// <summary>
    /// If an occurrence isn't free: book nothing, or book the rest and report it.
    /// </summary>
    [Optional]
    [JsonPropertyName("on_conflict")]
    public CreateSeriesRequestOnConflict? OnConflict { get; set; }

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
