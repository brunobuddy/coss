using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The contract in effect; `null` on the Free plan.
/// </summary>
[Serializable]
public record BillingOverviewContract : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The contract's id.
    /// </summary>
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// `self_serve`: chosen in the dashboard. `sales`: agreed with coss.com. `internal`: coss.com's own.
    /// </summary>
    [JsonPropertyName("kind")]
    public required BillingOverviewContractKind Kind { get; set; }

    /// <summary>
    /// When it took effect.
    /// </summary>
    [JsonPropertyName("effective_from")]
    public required DateTime EffectiveFrom { get; set; }

    /// <summary>
    /// When it ends. `null`: no end is set.
    /// </summary>
    [Nullable]
    [JsonPropertyName("effective_until")]
    public DateTime? EffectiveUntil { get; set; }

    /// <summary>
    /// End of a committed term.
    /// </summary>
    [Nullable]
    [JsonPropertyName("term_end")]
    public DateTime? TermEnd { get; set; }

    /// <summary>
    /// Whether a committed term renews when it ends.
    /// </summary>
    [JsonPropertyName("auto_renew")]
    public required bool AutoRenew { get; set; }

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
