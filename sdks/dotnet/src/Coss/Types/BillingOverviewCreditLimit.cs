using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Where the organization stands against its credit limit; `null`: it has none.
/// </summary>
[Serializable]
public record BillingOverviewCreditLimit : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// What coss.com carries before live sending is held. It rises as payments settle.
    /// </summary>
    [JsonPropertyName("limit")]
    public required long Limit { get; set; }

    /// <summary>
    /// Usage not invoiced yet, unpaid invoices and recent usage charges.
    /// </summary>
    [JsonPropertyName("used")]
    public required long Used { get; set; }

    /// <summary>
    /// Usage not invoiced yet is charged early at this amount; `null`: it isn't charged automatically.
    /// </summary>
    [Nullable]
    [JsonPropertyName("charge_threshold")]
    public long? ChargeThreshold { get; set; }

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
