using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Risk;

[Serializable]
public record UpdateRiskSettingsRequest
{
    /// <summary>
    /// Scores at or above it are `review`.
    /// </summary>
    [Optional]
    [JsonPropertyName("review_threshold")]
    public double? ReviewThreshold { get; set; }

    /// <summary>
    /// Scores at or above it are `block`.
    /// </summary>
    [Optional]
    [JsonPropertyName("block_threshold")]
    public double? BlockThreshold { get; set; }

    /// <summary>
    /// Reasons that never fire in this environment. Replaces the list.
    /// </summary>
    [Optional]
    [JsonPropertyName("disabled_reasons")]
    public IEnumerable<UpdateRiskSettingsRequestDisabledReasonsItem>? DisabledReasons { get; set; }

    /// <summary>
    /// `null` turns captcha verification off and deletes the secret.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("captcha")]
    public Optional<UpdateRiskSettingsRequestCaptcha?> Captcha { get; set; }

    /// <summary>
    /// Changes the categories given: a score in (0, 1] sets the threshold, `null` removes it.
    /// </summary>
    [Optional]
    [JsonPropertyName("content_thresholds")]
    public UpdateRiskSettingsRequestContentThresholds? ContentThresholds { get; set; }

    /// <summary>
    /// Changes the reasons given: a weight in [0, 0.99] replaces the default, `null` goes back to it.
    /// </summary>
    [Optional]
    [JsonPropertyName("reason_weights")]
    public UpdateRiskSettingsRequestReasonWeights? ReasonWeights { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
