using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record BillingWebhookEventTwoData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The organization's id.
    /// </summary>
    [JsonPropertyName("organization_id")]
    public required string OrganizationId { get; set; }

    /// <summary>
    /// When it happened: sort events by it.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

    /// <summary>
    /// `upgrade` (in effect now), `downgrade`/`cancellation` (scheduled), `reverted` (a scheduled change was undone), `contract` (a contract changed).
    /// </summary>
    [JsonPropertyName("change")]
    public required BillingWebhookEventTwoDataChange Change { get; set; }

    /// <summary>
    /// The plan from `effective_at`.
    /// </summary>
    [JsonPropertyName("plan")]
    public required BillingWebhookEventTwoDataPlan Plan { get; set; }

    [JsonPropertyName("previous_plan")]
    public required BillingWebhookEventTwoDataPreviousPlan PreviousPlan { get; set; }

    [JsonPropertyName("effective_at")]
    public required DateTime EffectiveAt { get; set; }

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
