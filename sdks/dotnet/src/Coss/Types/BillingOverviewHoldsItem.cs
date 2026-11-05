using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record BillingOverviewHoldsItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// `delinquent`: an invoice is past its grace period. `spend_limit`: the spend limit was reached. `credit_limit`: the credit limit was reached, or a usage charge failed. `admin`: placed by coss.com.
    /// </summary>
    [JsonPropertyName("reason")]
    public required BillingOverviewHoldsItemReason Reason { get; set; }

    /// <summary>
    /// When the hold began.
    /// </summary>
    [JsonPropertyName("since")]
    public required DateTime Since { get; set; }

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
