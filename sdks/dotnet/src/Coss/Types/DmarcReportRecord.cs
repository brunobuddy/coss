using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record DmarcReportRecord : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The address the messages came from.
    /// </summary>
    [JsonPropertyName("source_ip")]
    public required string SourceIp { get; set; }

    /// <summary>
    /// How many messages this line covers.
    /// </summary>
    [JsonPropertyName("count")]
    public required long Count { get; set; }

    /// <summary>
    /// What the receiver did with the messages.
    /// </summary>
    [JsonPropertyName("disposition")]
    public required DmarcReportRecordDisposition Disposition { get; set; }

    /// <summary>
    /// Aligned DKIM result.
    /// </summary>
    [JsonPropertyName("dkim")]
    public required DmarcReportRecordDkim Dkim { get; set; }

    /// <summary>
    /// Aligned SPF result.
    /// </summary>
    [JsonPropertyName("spf")]
    public required DmarcReportRecordSpf Spf { get; set; }

    /// <summary>
    /// Whether they passed DMARC.
    /// </summary>
    [JsonPropertyName("dmarc_pass")]
    public required bool DmarcPass { get; set; }

    /// <summary>
    /// The domain in their `From` header.
    /// </summary>
    [JsonPropertyName("header_from")]
    public required string HeaderFrom { get; set; }

    /// <summary>
    /// The domain in their envelope sender.
    /// </summary>
    [Nullable]
    [JsonPropertyName("envelope_from")]
    public string? EnvelopeFrom { get; set; }

    /// <summary>
    /// Whether they were sent through coss.com, by its DKIM selectors or bounce domain.
    /// </summary>
    [JsonPropertyName("via_coss")]
    public required bool ViaCoss { get; set; }

    /// <summary>
    /// What receivers saw for DKIM and SPF.
    /// </summary>
    [JsonPropertyName("auth_results")]
    public required DmarcReportRecordAuthResults AuthResults { get; set; }

    /// <summary>
    /// Why receivers overrode the policy.
    /// </summary>
    [JsonPropertyName("reasons")]
    public IEnumerable<DmarcReportRecordReasonsItem> Reasons { get; set; } =
        new List<DmarcReportRecordReasonsItem>();

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
