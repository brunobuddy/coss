using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Which opens and clicks are tracked.
/// </summary>
[Serializable]
public record BroadcastTracking : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Whether opens are tracked.
    /// </summary>
    [JsonPropertyName("opens")]
    public required bool Opens { get; set; }

    /// <summary>
    /// Whether clicks are tracked.
    /// </summary>
    [JsonPropertyName("clicks")]
    public required bool Clicks { get; set; }

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
