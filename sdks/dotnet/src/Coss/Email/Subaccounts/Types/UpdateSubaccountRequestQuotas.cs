using Coss;
using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Email;

/// <summary>
/// Fields left out keep their value; `null` removes a quota.
/// </summary>
[Serializable]
public record UpdateSubaccountRequestQuotas : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Most recipients a day. `null` removes the limit.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("recipients_per_day")]
    public Optional<int?> RecipientsPerDay { get; set; }

    /// <summary>
    /// Most recipients a second. `null` removes the limit.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("recipients_per_second")]
    public Optional<int?> RecipientsPerSecond { get; set; }

    /// <summary>
    /// How many recipients a moment may take before the per-second rate applies. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("burst")]
    public Optional<int?> Burst { get; set; }

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
