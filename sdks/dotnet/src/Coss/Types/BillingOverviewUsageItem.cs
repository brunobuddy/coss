using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record BillingOverviewUsageItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// What is counted, e.g. `email.recipients`.
    /// </summary>
    [JsonPropertyName("meter")]
    public required BillingOverviewUsageItemMeter Meter { get; set; }

    /// <summary>
    /// Units used so far this month.
    /// </summary>
    [JsonPropertyName("quantity")]
    public required long Quantity { get; set; }

    /// <summary>
    /// The plan's monthly allowance where usage stops (Free), else `null`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("included")]
    public long? Included { get; set; }

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
