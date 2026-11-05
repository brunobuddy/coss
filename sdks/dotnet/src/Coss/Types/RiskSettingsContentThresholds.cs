using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Per content category, the score at which `content.&lt;category&gt;` fires; `null`: never (the score is still in `signals.content` for your rules).
/// </summary>
[Serializable]
public record RiskSettingsContentThresholds : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The score at which `content.spam` fires. `null`: never.
    /// </summary>
    [Nullable]
    [JsonPropertyName("spam")]
    public double? Spam { get; set; }

    /// <summary>
    /// The score at which `content.phishing` fires. `null`: never.
    /// </summary>
    [Nullable]
    [JsonPropertyName("phishing")]
    public double? Phishing { get; set; }

    /// <summary>
    /// The score at which `content.malware` fires. `null`: never.
    /// </summary>
    [Nullable]
    [JsonPropertyName("malware")]
    public double? Malware { get; set; }

    /// <summary>
    /// The score at which `content.fraud` fires. `null`: never.
    /// </summary>
    [Nullable]
    [JsonPropertyName("fraud")]
    public double? Fraud { get; set; }

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
