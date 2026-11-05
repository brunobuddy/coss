using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Scheduling;

[Serializable]
public record CreateHoldRequest
{
    /// <summary>
    /// Makes retries safe: a repeated request with the same key and body returns the original booking instead of creating another, for 24 hours. A refused request keeps no key. 1-256 characters.
    /// </summary>
    [JsonIgnore]
    public string? IdempotencyKey { get; set; }

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
    public CreateHoldRequestLocation? Location { get; set; }

    /// <summary>
    /// Your own key-value pairs. Don't put sensitive data here.
    /// </summary>
    [Optional]
    [JsonPropertyName("metadata")]
    public Dictionary<string, string>? Metadata { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
