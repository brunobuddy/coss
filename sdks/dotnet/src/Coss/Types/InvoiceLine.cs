using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record InvoiceLine : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required InvoiceLineObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// What it's for: `plan_fee`, `proration`, `usage`, `credit`, `discount`, `commitment_fee`, `commitment_shortfall`, `add_on`, `adjustment` or `write_off`.
    /// </summary>
    [JsonPropertyName("kind")]
    public required InvoiceLineKind Kind { get; set; }

    /// <summary>
    /// The line as it reads on the invoice.
    /// </summary>
    [JsonPropertyName("description")]
    public required string Description { get; set; }

    /// <summary>
    /// The meter of a `usage` line. `null` for other lines.
    /// </summary>
    [Nullable]
    [JsonPropertyName("meter")]
    public InvoiceLineMeter? Meter { get; set; }

    /// <summary>
    /// What the meter is split by, such as `country=US`. `null`: not split.
    /// </summary>
    [Nullable]
    [JsonPropertyName("dimension")]
    public string? Dimension { get; set; }

    /// <summary>
    /// Units on this line. `null` when it isn't priced by the unit.
    /// </summary>
    [Nullable]
    [JsonPropertyName("quantity")]
    public long? Quantity { get; set; }

    /// <summary>
    /// Units covered by an allowance or committed volume (not charged).
    /// </summary>
    [Nullable]
    [JsonPropertyName("included_quantity")]
    public long? IncludedQuantity { get; set; }

    /// <summary>
    /// Dollars per unit, e.g. `0.0004`; `null` when the price varies by volume.
    /// </summary>
    [Nullable]
    [JsonPropertyName("unit_price")]
    public string? UnitPrice { get; set; }

    /// <summary>
    /// An amount in cents (USD).
    /// </summary>
    [JsonPropertyName("amount")]
    public required long Amount { get; set; }

    /// <summary>
    /// What period it covers.
    /// </summary>
    [JsonPropertyName("period")]
    public required InvoiceLinePeriod Period { get; set; }

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
