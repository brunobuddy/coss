using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Hooks;

[Serializable]
public record UpdateHookEventTypeRequest
{
    /// <summary>
    /// The event type's name.
    /// </summary>
    [JsonIgnore]
    public required string Name { get; set; }

    /// <summary>
    /// What this event means, shown to your users. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("description")]
    public Optional<string?> Description { get; set; }

    /// <summary>
    /// A JSON Schema of the payload, shown to your users (not enforced).
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("schema")]
    public Optional<Dictionary<string, object?>?> Schema { get; set; }

    /// <summary>
    /// Up to 5 example payloads; the first is what a test send delivers.
    /// </summary>
    [Optional]
    [JsonPropertyName("examples")]
    public IEnumerable<Dictionary<string, object?>>? Examples { get; set; }

    /// <summary>
    /// `false` restores an archived type.
    /// </summary>
    [Optional]
    [JsonPropertyName("archived")]
    public bool? Archived { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
