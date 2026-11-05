using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record BillingWebhookEventThreeData : IJsonOnDeserialized
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
    /// The threshold crossed, e.g. 80.
    /// </summary>
    [JsonPropertyName("percent")]
    public required long Percent { get; set; }

    /// <summary>
    /// `credit`: the month's usage credit; `allowance`: a capped plan's included units.
    /// </summary>
    [JsonPropertyName("of")]
    public required BillingWebhookEventThreeDataOf Of { get; set; }

    /// <summary>
    /// The allowance's meter (`of: allowance`).
    /// </summary>
    [Nullable]
    [JsonPropertyName("meter")]
    public BillingWebhookEventThreeDataMeter? Meter { get; set; }

    [JsonPropertyName("period")]
    public required BillingWebhookEventThreeDataPeriod Period { get; set; }

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
