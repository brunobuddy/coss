using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The sub-account's standing.
/// </summary>
[Serializable]
public record SubaccountWebhookEventData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The sub-account's id.
    /// </summary>
    [JsonPropertyName("subaccount_id")]
    public required string SubaccountId { get; set; }

    /// <summary>
    /// Your own id for it. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("uid")]
    public string? Uid { get; set; }

    /// <summary>
    /// Its status after this event.
    /// </summary>
    [JsonPropertyName("status")]
    public required SubaccountWebhookEventDataStatus Status { get; set; }

    /// <summary>
    /// Its status before.
    /// </summary>
    [JsonPropertyName("previous_status")]
    public required SubaccountWebhookEventDataPreviousStatus PreviousStatus { get; set; }

    /// <summary>
    /// What changed it: a check (`bounce_rate`, `complaint_rate`), `content_screening` or `reinstated`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("trigger")]
    public string? Trigger { get; set; }

    /// <summary>
    /// When this happened.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

    /// <summary>
    /// The measurements behind the change (empty for reinstatements and screening).
    /// </summary>
    [JsonPropertyName("checks")]
    public IEnumerable<ReputationCheck> Checks { get; set; } = new List<ReputationCheck>();

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
