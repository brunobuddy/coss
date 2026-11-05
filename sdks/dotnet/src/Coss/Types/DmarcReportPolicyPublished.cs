using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The policy the reporter found when it evaluated the mail.
/// </summary>
[Serializable]
public record DmarcReportPolicyPublished : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The domain the policy was published for.
    /// </summary>
    [JsonPropertyName("domain")]
    public required string Domain { get; set; }

    /// <summary>
    /// The domain's policy tag.
    /// </summary>
    [Nullable]
    [JsonPropertyName("p")]
    public string? P { get; set; }

    /// <summary>
    /// The subdomain policy tag.
    /// </summary>
    [Nullable]
    [JsonPropertyName("sp")]
    public string? Sp { get; set; }

    /// <summary>
    /// The policy tag for non-existent subdomains.
    /// </summary>
    [Nullable]
    [JsonPropertyName("np")]
    public string? Np { get; set; }

    /// <summary>
    /// The DKIM alignment tag.
    /// </summary>
    [Nullable]
    [JsonPropertyName("adkim")]
    public string? Adkim { get; set; }

    /// <summary>
    /// The SPF alignment tag.
    /// </summary>
    [Nullable]
    [JsonPropertyName("aspf")]
    public string? Aspf { get; set; }

    /// <summary>
    /// The percentage tag.
    /// </summary>
    [Nullable]
    [JsonPropertyName("pct")]
    public long? Pct { get; set; }

    /// <summary>
    /// The testing tag.
    /// </summary>
    [Nullable]
    [JsonPropertyName("testing")]
    public string? Testing { get; set; }

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
