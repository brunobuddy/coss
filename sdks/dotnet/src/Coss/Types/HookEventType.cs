using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record HookEventType : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required HookEventTypeObject Object { get; set; }

    /// <summary>
    /// The type's name, which messages send as `event_type`.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// What this event means, shown to your users. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    /// <summary>
    /// A JSON Schema of the payload, shown to your users (not enforced). `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("schema")]
    public Dictionary<string, object?>? Schema { get; set; }

    /// <summary>
    /// Sample payloads, shown to your users. Test sends use the first.
    /// </summary>
    [JsonPropertyName("examples")]
    public IEnumerable<Dictionary<string, object?>> Examples { get; set; } =
        new List<Dictionary<string, object?>>();

    /// <summary>
    /// Archived types are hidden from the portal and can't be subscribed to; messages of the type are still delivered to endpoints that subscribed before.
    /// </summary>
    [JsonPropertyName("archived")]
    public required bool Archived { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required DateTime UpdatedAt { get; set; }

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
