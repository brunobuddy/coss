using Coss;
using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Risk;

/// <summary>
/// Changes the categories given: a score in (0, 1] sets the threshold, `null` removes it.
/// </summary>
[Serializable]
public record UpdateRiskSettingsRequestContentThresholds : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The score at which `content.spam` fires. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("spam")]
    public Optional<double?> Spam { get; set; }

    /// <summary>
    /// The score at which `content.phishing` fires. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("phishing")]
    public Optional<double?> Phishing { get; set; }

    /// <summary>
    /// The score at which `content.malware` fires. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("malware")]
    public Optional<double?> Malware { get; set; }

    /// <summary>
    /// The score at which `content.fraud` fires. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("fraud")]
    public Optional<double?> Fraud { get; set; }

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
