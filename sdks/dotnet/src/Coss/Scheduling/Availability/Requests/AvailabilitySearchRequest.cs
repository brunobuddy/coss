using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Scheduling;

[Serializable]
public record AvailabilitySearchRequest
{
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
    /// An ISO 8601 instant with an offset.
    /// </summary>
    [JsonPropertyName("end")]
    public required string End { get; set; }

    /// <summary>
    /// Only hosts matching all of these.
    /// </summary>
    [Optional]
    [JsonPropertyName("attributes")]
    public Dictionary<string, OneOf<string, IEnumerable<string>>>? Attributes { get; set; }

    /// <summary>
    /// Only these hosts (ids or uids). Default: everyone the event type could offer.
    /// </summary>
    [Optional]
    [JsonPropertyName("hosts")]
    public IEnumerable<string>? Hosts { get; set; }

    /// <summary>
    /// How many of each host's soonest slots to return.
    /// </summary>
    [Optional]
    [JsonPropertyName("slots_per_host")]
    public int? SlotsPerHost { get; set; }

    /// <summary>
    /// Hosts to return, soonest availability first.
    /// </summary>
    [Optional]
    [JsonPropertyName("limit")]
    public int? Limit { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
