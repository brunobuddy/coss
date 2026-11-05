using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Its own sending limits.
/// </summary>
[Serializable]
public record SubaccountQuotas : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Recipients it may send to per day; `null`: only your organization's quota.
    /// </summary>
    [Nullable]
    [JsonPropertyName("recipients_per_day")]
    public int? RecipientsPerDay { get; set; }

    /// <summary>
    /// Recipients it may send to per second; `null`: only your organization's quota.
    /// </summary>
    [Nullable]
    [JsonPropertyName("recipients_per_second")]
    public int? RecipientsPerSecond { get; set; }

    /// <summary>
    /// How many recipients a moment may take before the per-second rate applies; `null`: the per-second rate.
    /// </summary>
    [Nullable]
    [JsonPropertyName("burst")]
    public int? Burst { get; set; }

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
