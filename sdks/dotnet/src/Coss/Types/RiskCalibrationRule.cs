using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record RiskCalibrationRule : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The rule's id.
    /// </summary>
    [JsonPropertyName("rule")]
    public required string Rule { get; set; }

    /// <summary>
    /// The rule's name.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Assessments it decided.
    /// </summary>
    [JsonPropertyName("matched")]
    public required long Matched { get; set; }

    /// <summary>
    /// With feedback `fraud` or `abuse`.
    /// </summary>
    [JsonPropertyName("fraud")]
    public required long Fraud { get; set; }

    /// <summary>
    /// With feedback `legitimate`.
    /// </summary>
    [JsonPropertyName("legitimate")]
    public required long Legitimate { get; set; }

    /// <summary>
    /// `fraud / (fraud + legitimate)`: how often it was right when you told coss.com. `null` without feedback.
    /// </summary>
    [Nullable]
    [JsonPropertyName("precision")]
    public double? Precision { get; set; }

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
