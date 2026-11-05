using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Per category, the model's probability (0-1) that the content belongs to it. Scores are not calibrated: pick thresholds by looking at your own traffic.
/// </summary>
[Serializable]
public record RiskContentSignals : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The model's probability (0-1) that it's spam.
    /// </summary>
    [JsonPropertyName("spam")]
    public required double Spam { get; set; }

    /// <summary>
    /// The model's probability (0-1) that it's phishing.
    /// </summary>
    [JsonPropertyName("phishing")]
    public required double Phishing { get; set; }

    /// <summary>
    /// The model's probability (0-1) that it's malware.
    /// </summary>
    [JsonPropertyName("malware")]
    public required double Malware { get; set; }

    /// <summary>
    /// The model's probability (0-1) that it's fraud.
    /// </summary>
    [JsonPropertyName("fraud")]
    public required double Fraud { get; set; }

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
