using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record RiskCalibrationReason : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The reason's code.
    /// </summary>
    [JsonPropertyName("code")]
    public required RiskCalibrationReasonCode Code { get; set; }

    /// <summary>
    /// Assessments it fired in.
    /// </summary>
    [JsonPropertyName("fired")]
    public required long Fired { get; set; }

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

    /// <summary>
    /// Its weight unless this environment changes it.
    /// </summary>
    [JsonPropertyName("default_weight")]
    public required double DefaultWeight { get; set; }

    /// <summary>
    /// Its weight in this environment now.
    /// </summary>
    [JsonPropertyName("weight")]
    public required double Weight { get; set; }

    /// <summary>
    /// The weight feedback supports: its precision, pulled toward the default while there is little feedback. `null` below 20 assessments with feedback.
    /// </summary>
    [Nullable]
    [JsonPropertyName("suggested_weight")]
    public double? SuggestedWeight { get; set; }

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
