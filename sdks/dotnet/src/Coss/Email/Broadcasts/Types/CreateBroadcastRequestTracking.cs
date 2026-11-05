using Coss;
using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Email;

/// <summary>
/// Which opens and clicks are tracked.
/// </summary>
[Serializable]
public record CreateBroadcastRequestTracking : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Track opens with a pixel.
    /// </summary>
    [Optional]
    [JsonPropertyName("opens")]
    public bool? Opens { get; set; }

    /// <summary>
    /// Track clicks by rewriting links.
    /// </summary>
    [Optional]
    [JsonPropertyName("clicks")]
    public bool? Clicks { get; set; }

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
