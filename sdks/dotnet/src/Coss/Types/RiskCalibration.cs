using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Feedback against the reasons and rules that fired, over the last 90 days. Feedback you give mostly on reviews and blocks over-represents those: read precision as a guide, not a measurement.
/// </summary>
[Serializable]
public record RiskCalibration : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required RiskCalibrationObject Object { get; set; }

    /// <summary>
    /// How many days back it looks.
    /// </summary>
    [JsonPropertyName("window_days")]
    public required long WindowDays { get; set; }

    /// <summary>
    /// Assessments in the window.
    /// </summary>
    [JsonPropertyName("assessments")]
    public required long Assessments { get; set; }

    /// <summary>
    /// Of those, with feedback.
    /// </summary>
    [JsonPropertyName("labeled")]
    public required long Labeled { get; set; }

    /// <summary>
    /// How each reason did against your feedback.
    /// </summary>
    [JsonPropertyName("reasons")]
    public IEnumerable<RiskCalibrationReason> Reasons { get; set; } =
        new List<RiskCalibrationReason>();

    /// <summary>
    /// How each rule did against your feedback.
    /// </summary>
    [JsonPropertyName("rules")]
    public IEnumerable<RiskCalibrationRule> Rules { get; set; } = new List<RiskCalibrationRule>();

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
