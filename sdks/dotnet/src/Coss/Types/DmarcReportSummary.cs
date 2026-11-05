using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record DmarcReportSummary : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required DmarcReportSummaryObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The domain's id.
    /// </summary>
    [JsonPropertyName("domain_id")]
    public required string DomainId { get; set; }

    /// <summary>
    /// Who sent the report.
    /// </summary>
    [JsonPropertyName("reporter")]
    public required DmarcReportSummaryReporter Reporter { get; set; }

    /// <summary>
    /// The reporter's own id of the report.
    /// </summary>
    [JsonPropertyName("report_id")]
    public required string ReportId { get; set; }

    /// <summary>
    /// When the period it covers starts.
    /// </summary>
    [JsonPropertyName("period_start")]
    public required DateTime PeriodStart { get; set; }

    /// <summary>
    /// When the period it covers ends.
    /// </summary>
    [JsonPropertyName("period_end")]
    public required DateTime PeriodEnd { get; set; }

    /// <summary>
    /// The policy the reporter found when it evaluated the mail.
    /// </summary>
    [JsonPropertyName("policy_published")]
    public required DmarcReportSummaryPolicyPublished PolicyPublished { get; set; }

    /// <summary>
    /// Messages the report covers.
    /// </summary>
    [JsonPropertyName("messages")]
    public required long Messages { get; set; }

    /// <summary>
    /// Of those, how many passed DMARC.
    /// </summary>
    [JsonPropertyName("passing")]
    public required long Passing { get; set; }

    /// <summary>
    /// The report listed more rows than are kept (10,000); totals cover the kept rows.
    /// </summary>
    [JsonPropertyName("truncated")]
    public required bool Truncated { get; set; }

    /// <summary>
    /// When coss.com received it.
    /// </summary>
    [JsonPropertyName("received_at")]
    public required DateTime ReceivedAt { get; set; }

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
