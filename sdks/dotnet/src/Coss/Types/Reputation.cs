using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record Reputation : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required ReputationObject Object { get; set; }

    /// <summary>
    /// `good`, `warning` (a rate is approaching the suspension threshold) or `suspended` (live sending is refused until coss.com support reinstates the organization).
    /// </summary>
    [JsonPropertyName("status")]
    public required ReputationStatus Status { get; set; }

    /// <summary>
    /// The trigger behind a `warning` or `suspended` status.
    /// </summary>
    [Nullable]
    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    /// <summary>
    /// When `status` last changed. `null`: it never has.
    /// </summary>
    [Nullable]
    [JsonPropertyName("status_changed_at")]
    public DateTime? StatusChangedAt { get; set; }

    /// <summary>
    /// When the checks below were computed; `null` before the first evaluation.
    /// </summary>
    [Nullable]
    [JsonPropertyName("evaluated_at")]
    public DateTime? EvaluatedAt { get; set; }

    /// <summary>
    /// The period the checks cover (live environments only).
    /// </summary>
    [Nullable]
    [JsonPropertyName("window")]
    public ReputationWindow? Window { get; set; }

    /// <summary>
    /// The measurements behind `status`.
    /// </summary>
    [JsonPropertyName("checks")]
    public IEnumerable<ReputationCheck> Checks { get; set; } = new List<ReputationCheck>();

    [JsonPropertyName("marketing")]
    public required MarketingStanding Marketing { get; set; }

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
