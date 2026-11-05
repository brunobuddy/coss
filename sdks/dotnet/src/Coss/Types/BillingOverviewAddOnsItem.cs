using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record BillingOverviewAddOnsItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// e.g. `dedicated_ips`.
    /// </summary>
    [JsonPropertyName("key")]
    public required string Key { get; set; }

    /// <summary>
    /// The add-on's name.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// How many units are on the contract.
    /// </summary>
    [JsonPropertyName("quantity")]
    public required long Quantity { get; set; }

    /// <summary>
    /// The price per unit and interval, in cents.
    /// </summary>
    [JsonPropertyName("unit_amount")]
    public required long UnitAmount { get; set; }

    /// <summary>
    /// How often it's charged.
    /// </summary>
    [JsonPropertyName("interval")]
    public required BillingOverviewAddOnsItemInterval Interval { get; set; }

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
