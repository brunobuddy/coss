using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SuppressionCheck : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SuppressionCheckObject Object { get; set; }

    /// <summary>
    /// The address checked.
    /// </summary>
    [JsonPropertyName("address")]
    public required string Address { get; set; }

    /// <summary>
    /// Whether a send (with the given category) would skip this address.
    /// </summary>
    [JsonPropertyName("suppressed")]
    public required bool Suppressed { get; set; }

    /// <summary>
    /// The entries that match.
    /// </summary>
    [JsonPropertyName("suppressions")]
    public IEnumerable<Suppression> Suppressions { get; set; } = new List<Suppression>();

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
