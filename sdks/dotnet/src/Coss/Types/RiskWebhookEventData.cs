using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The assessment, without its signals.
/// </summary>
[Serializable]
public record RiskWebhookEventData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The assessment's id.
    /// </summary>
    [JsonPropertyName("assessment_id")]
    public required string AssessmentId { get; set; }

    [JsonPropertyName("event")]
    public required RiskEvent Event { get; set; }

    /// <summary>
    /// Your name for a `custom` event. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("event_name")]
    public string? EventName { get; set; }

    [JsonPropertyName("decision")]
    public required RiskDecision Decision { get; set; }

    /// <summary>
    /// 0-1: how risky the signals are together.
    /// </summary>
    [JsonPropertyName("score")]
    public required double Score { get; set; }

    /// <summary>
    /// Why, most significant first.
    /// </summary>
    [JsonPropertyName("reasons")]
    public IEnumerable<RiskReason> Reasons { get; set; } = new List<RiskReason>();

    /// <summary>
    /// Your user id. `null`: none given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("user_id")]
    public string? UserId { get; set; }

    /// <summary>
    /// `risk.assessment.reviewed`: the outcome that resolved the review.
    /// </summary>
    [Nullable]
    [JsonPropertyName("outcome")]
    public RiskOutcome? Outcome { get; set; }

    /// <summary>
    /// When this happened.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

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
