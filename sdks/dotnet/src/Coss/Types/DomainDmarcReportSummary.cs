using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// What the aggregate reports of this period say.
/// </summary>
[Serializable]
public record DomainDmarcReportSummary : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// When the period starts.
    /// </summary>
    [JsonPropertyName("period_start")]
    public required DateTime PeriodStart { get; set; }

    /// <summary>
    /// When the period ends.
    /// </summary>
    [JsonPropertyName("period_end")]
    public required DateTime PeriodEnd { get; set; }

    /// <summary>
    /// Reports received.
    /// </summary>
    [JsonPropertyName("reports")]
    public required long Reports { get; set; }

    /// <summary>
    /// Messages they cover.
    /// </summary>
    [JsonPropertyName("messages")]
    public required long Messages { get; set; }

    /// <summary>
    /// Of those, how many passed DMARC.
    /// </summary>
    [JsonPropertyName("passing")]
    public required long Passing { get; set; }

    /// <summary>
    /// Of those, how many were sent through coss.com.
    /// </summary>
    [JsonPropertyName("coss_messages")]
    public required long CossMessages { get; set; }

    /// <summary>
    /// Of those, how many passed DMARC.
    /// </summary>
    [JsonPropertyName("coss_passing")]
    public required long CossPassing { get; set; }

    /// <summary>
    /// When the first report arrived. `null`: none yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("first_report_at")]
    public DateTime? FirstReportAt { get; set; }

    /// <summary>
    /// When the latest report arrived. `null`: none yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last_report_at")]
    public DateTime? LastReportAt { get; set; }

    /// <summary>
    /// The 50 sources with the most messages in the period.
    /// </summary>
    [JsonPropertyName("sources")]
    public IEnumerable<DmarcSource> Sources { get; set; } = new List<DmarcSource>();

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
