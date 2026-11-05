using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Open and click tracking and one-click unsubscribe settings of the API key's environment. For each of `opens`, `clicks` and `unsubscribe`, a send's own `tracking` wins, then its category's rule, then `default` (the environment default; `null` when none is set), then off.
/// </summary>
[Serializable]
public record TrackingSettings : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required TrackingSettingsObject Object { get; set; }

    /// <summary>
    /// The environment's tracking default. `null`: none is set.
    /// </summary>
    [Nullable]
    [JsonPropertyName("default")]
    public TrackingRule? Default { get; set; }

    /// <summary>
    /// Category rules, by category name.
    /// </summary>
    [JsonPropertyName("categories")]
    public IEnumerable<TrackingRule> Categories { get; set; } = new List<TrackingRule>();

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
