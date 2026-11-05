using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Logins of a user with history: whether the country or network is new for them.
/// </summary>
[Serializable]
public record RiskLoginSignals : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Whether this user never logged in from this country in this environment.
    /// </summary>
    [JsonPropertyName("new_country")]
    public required bool NewCountry { get; set; }

    /// <summary>
    /// Whether this user never logged in from this network (ASN) in this environment.
    /// </summary>
    [JsonPropertyName("new_network")]
    public required bool NewNetwork { get; set; }

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
