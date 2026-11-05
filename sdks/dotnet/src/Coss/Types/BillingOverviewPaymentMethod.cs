using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The payment method on file. `null`: none.
/// </summary>
[Serializable]
public record BillingOverviewPaymentMethod : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Its type, such as `card`.
    /// </summary>
    [JsonPropertyName("type")]
    public required string Type { get; set; }

    /// <summary>
    /// The card's brand. `null` for other types.
    /// </summary>
    [Nullable]
    [JsonPropertyName("brand")]
    public string? Brand { get; set; }

    /// <summary>
    /// The card's last four digits. `null` for other types.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last4")]
    public string? Last4 { get; set; }

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
