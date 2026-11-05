using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record RiskIpPrivacy : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Whether it's a VPN exit.
    /// </summary>
    [JsonPropertyName("vpn")]
    public required bool Vpn { get; set; }

    /// <summary>
    /// Whether it's a proxy.
    /// </summary>
    [JsonPropertyName("proxy")]
    public required bool Proxy { get; set; }

    /// <summary>
    /// Whether it's a privacy relay.
    /// </summary>
    [JsonPropertyName("relay")]
    public required bool Relay { get; set; }

    /// <summary>
    /// The VPN or proxy service.
    /// </summary>
    [Nullable]
    [JsonPropertyName("service")]
    public string? Service { get; set; }

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
