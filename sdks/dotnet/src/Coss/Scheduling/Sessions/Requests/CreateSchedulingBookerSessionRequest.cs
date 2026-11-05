using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Scheduling;

[Serializable]
public record CreateSchedulingBookerSessionRequest
{
    /// <summary>
    /// The event type's id or uid.
    /// </summary>
    [JsonPropertyName("event_type")]
    public required string EventType { get; set; }

    /// <summary>
    /// Only this host (id or uid).
    /// </summary>
    [Optional]
    [JsonPropertyName("host")]
    public string? Host { get; set; }

    /// <summary>
    /// Only offer times, and book, among pool hosts matching all of these. The browser can't see or change them.
    /// </summary>
    [Optional]
    [JsonPropertyName("attributes")]
    public Dictionary<string, OneOf<string, IEnumerable<string>>>? Attributes { get; set; }

    /// <summary>
    /// Who's booking, if you already know: the browser then can't change it.
    /// </summary>
    [Optional]
    [JsonPropertyName("attendee")]
    public CreateSchedulingBookerSessionRequestAttendee? Attendee { get; set; }

    /// <summary>
    /// Seconds until it stops working. At most a day.
    /// </summary>
    [Optional]
    [JsonPropertyName("expires_in")]
    public int? ExpiresIn { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
