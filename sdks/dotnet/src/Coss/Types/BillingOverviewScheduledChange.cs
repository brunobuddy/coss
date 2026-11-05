using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// A plan change that takes effect later (a downgrade, a cancellation).
/// </summary>
[Serializable]
public record BillingOverviewScheduledChange : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// When it takes effect.
    /// </summary>
    [JsonPropertyName("effective_at")]
    public required DateTime EffectiveAt { get; set; }

    /// <summary>
    /// The plan it changes to.
    /// </summary>
    [JsonPropertyName("plan")]
    public required BillingOverviewScheduledChangePlan Plan { get; set; }

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
