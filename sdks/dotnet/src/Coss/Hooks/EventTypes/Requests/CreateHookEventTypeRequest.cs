using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Hooks;

[Serializable]
public record CreateHookEventTypeRequest
{
    /// <summary>
    /// The type's name, which messages send as `event_type`. Letters, digits and `. _ -`.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// What this event means, shown to your users.
    /// </summary>
    [Optional]
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    /// <summary>
    /// A JSON Schema of the payload, shown to your users (not enforced).
    /// </summary>
    [Optional]
    [JsonPropertyName("schema")]
    public Dictionary<string, object?>? Schema { get; set; }

    /// <summary>
    /// Up to 5 example payloads; the first is what a test send delivers.
    /// </summary>
    [Optional]
    [JsonPropertyName("examples")]
    public IEnumerable<Dictionary<string, object?>>? Examples { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
