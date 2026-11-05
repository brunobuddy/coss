using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record RiskAssessment : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required RiskAssessmentObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

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
    /// 0-1: how risky the signals are together. Lists can decide regardless of the score.
    /// </summary>
    [JsonPropertyName("score")]
    public required double Score { get; set; }

    /// <summary>
    /// Why, most significant first.
    /// </summary>
    [JsonPropertyName("reasons")]
    public IEnumerable<RiskReason> Reasons { get; set; } = new List<RiskReason>();

    /// <summary>
    /// What the assessment saw, by group. A group is `null` when it had nothing to go on.
    /// </summary>
    [JsonPropertyName("signals")]
    public required RiskAssessmentSignals Signals { get; set; }

    /// <summary>
    /// Who it's about.
    /// </summary>
    [JsonPropertyName("user")]
    public required RiskAssessmentUser User { get; set; }

    /// <summary>
    /// `null` once removed (90 days after).
    /// </summary>
    [Nullable]
    [JsonPropertyName("ip")]
    public string? Ip { get; set; }

    /// <summary>
    /// Signal groups that were unavailable for this assessment (it was made without them). `usage_limit` means the plan's included assessments are used up, or a billing hold or budget applies: the assessment was free and made without velocity, memory of earlier events, content or address-level IP data.
    /// </summary>
    [JsonPropertyName("degraded")]
    public IEnumerable<RiskAssessmentDegradedItem> Degraded { get; set; } =
        new List<RiskAssessmentDegradedItem>();

    /// <summary>
    /// The latest outcome you reported with feedback.
    /// </summary>
    [Nullable]
    [JsonPropertyName("outcome")]
    public RiskOutcome? Outcome { get; set; }

    /// <summary>
    /// `open` for `review` decisions until you send feedback, then `resolved`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("review_status")]
    public RiskAssessmentReviewStatus? ReviewStatus { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

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
