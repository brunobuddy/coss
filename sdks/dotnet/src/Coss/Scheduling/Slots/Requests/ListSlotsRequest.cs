using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record ListSlotsRequest
{
    /// <summary>
    /// The event type's id or uid.
    /// </summary>
    [JsonIgnore]
    public required string EventType { get; set; }

    /// <summary>
    /// An ISO 8601 instant with an offset.
    /// </summary>
    [JsonIgnore]
    public required string Start { get; set; }

    /// <summary>
    /// An ISO 8601 instant with an offset.
    /// </summary>
    [JsonIgnore]
    public required string End { get; set; }

    /// <summary>
    /// Only this host's slots (id or uid).
    /// </summary>
    [JsonIgnore]
    public string? Host { get; set; }

    [JsonIgnore]
    public int? DurationMinutes { get; set; }

    /// <summary>
    /// A JSON object narrowing a pool, such as `{"licensed_in":"CA"}`.
    /// </summary>
    [JsonIgnore]
    public string? Attributes { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
