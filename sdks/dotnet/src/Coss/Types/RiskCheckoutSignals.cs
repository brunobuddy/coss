using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// What you sent in `checkout` (never the card).
/// </summary>
[Serializable]
public record RiskCheckoutSignals : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The amount you sent, in the currency's smallest unit.
    /// </summary>
    [JsonPropertyName("amount")]
    public required long Amount { get; set; }

    /// <summary>
    /// The currency you sent.
    /// </summary>
    [JsonPropertyName("currency")]
    public required string Currency { get; set; }

    /// <summary>
    /// The card's country. `null` when not given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("card_country")]
    public string? CardCountry { get; set; }

    /// <summary>
    /// The card's funding type. `null` when not given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("card_funding")]
    public RiskCheckoutSignalsCardFunding? CardFunding { get; set; }

    /// <summary>
    /// The billing country. `null` when not given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("billing_country")]
    public string? BillingCountry { get; set; }

    /// <summary>
    /// The shipping country. `null` when not given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("shipping_country")]
    public string? ShippingCountry { get; set; }

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
