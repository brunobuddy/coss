using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// What the address says. `null` on an assessment with no IP.
/// </summary>
[Serializable]
public record RiskIpSignals : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("version")]
    public required double Version { get; set; }

    /// <summary>
    /// Whether it's a private or reserved address.
    /// </summary>
    [JsonPropertyName("private")]
    public required bool Private { get; set; }

    /// <summary>
    /// Whether it's a Tor exit.
    /// </summary>
    [JsonPropertyName("tor")]
    public required bool Tor { get; set; }

    /// <summary>
    /// Whether it's in a cloud, hosting or VPN network.
    /// </summary>
    [JsonPropertyName("hosting")]
    public required bool Hosting { get; set; }

    /// <summary>
    /// That network's operator. `null` when it isn't one.
    /// </summary>
    [Nullable]
    [JsonPropertyName("hosting_provider")]
    public string? HostingProvider { get; set; }

    /// <summary>
    /// `cloud`, `hosting` or `vpn`. `null` when it isn't one.
    /// </summary>
    [Nullable]
    [JsonPropertyName("hosting_kind")]
    public RiskIpSignalsHostingKind? HostingKind { get; set; }

    /// <summary>
    /// The network's autonomous system number. `null` when unknown.
    /// </summary>
    [Nullable]
    [JsonPropertyName("asn")]
    public long? Asn { get; set; }

    /// <summary>
    /// The network's name. `null` when unknown.
    /// </summary>
    [Nullable]
    [JsonPropertyName("as_name")]
    public string? AsName { get; set; }

    /// <summary>
    /// ISO 3166-1 alpha-2.
    /// </summary>
    [Nullable]
    [JsonPropertyName("country")]
    public string? Country { get; set; }

    /// <summary>
    /// From coss.com's IP privacy data provider (VPNs, proxies, relays). `null` when it isn't available or was not asked (private addresses).
    /// </summary>
    [Nullable]
    [JsonPropertyName("privacy")]
    public RiskIpPrivacy? Privacy { get; set; }

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
