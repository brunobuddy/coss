using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The DMARC record found at `_dmarc.&lt;domain&gt;` by the latest DNS check.
/// </summary>
[Serializable]
public record DmarcPublishedRecord : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The `v=DMARC1` TXT record as published.
    /// </summary>
    [JsonPropertyName("value")]
    public required string Value { get; set; }

    /// <summary>
    /// The domain's policy tag.
    /// </summary>
    [Nullable]
    [JsonPropertyName("p")]
    public DmarcPublishedRecordP? P { get; set; }

    /// <summary>
    /// The subdomain policy tag. `null`: not published.
    /// </summary>
    [Nullable]
    [JsonPropertyName("sp")]
    public DmarcPublishedRecordSp? Sp { get; set; }

    /// <summary>
    /// The policy tag for non-existent subdomains. `null`: not published.
    /// </summary>
    [Nullable]
    [JsonPropertyName("np")]
    public DmarcPublishedRecordNp? Np { get; set; }

    /// <summary>
    /// The DKIM alignment tag. `null`: not published.
    /// </summary>
    [Nullable]
    [JsonPropertyName("adkim")]
    public DmarcPublishedRecordAdkim? Adkim { get; set; }

    /// <summary>
    /// The SPF alignment tag. `null`: not published.
    /// </summary>
    [Nullable]
    [JsonPropertyName("aspf")]
    public DmarcPublishedRecordAspf? Aspf { get; set; }

    /// <summary>
    /// Removed by RFC 9989 but still honored by many receivers.
    /// </summary>
    [Nullable]
    [JsonPropertyName("pct")]
    public long? Pct { get; set; }

    /// <summary>
    /// The testing tag. `null`: not published.
    /// </summary>
    [Nullable]
    [JsonPropertyName("t")]
    public DmarcPublishedRecordT? T { get; set; }

    /// <summary>
    /// Aggregate report addresses.
    /// </summary>
    [JsonPropertyName("rua")]
    public IEnumerable<string> Rua { get; set; } = new List<string>();

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
