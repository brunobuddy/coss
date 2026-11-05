using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record DomainDmarc : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required DomainDmarcObject Object { get; set; }

    /// <summary>
    /// The domain's id.
    /// </summary>
    [JsonPropertyName("domain_id")]
    public required string DomainId { get; set; }

    /// <summary>
    /// Where the domain's DMARC aggregate reports go (`rua=mailto:…`). `null` when this deployment doesn't receive email.
    /// </summary>
    [Nullable]
    [JsonPropertyName("report_address")]
    public string? ReportAddress { get; set; }

    [Nullable]
    [JsonPropertyName("record")]
    public DmarcPublishedRecord? Record { get; set; }

    /// <summary>
    /// The policy receivers apply: the record's `p` (`none` when it has none), or for a subdomain without a record of its own, its organizational domain's `sp` (else `p`).
    /// </summary>
    [Nullable]
    [JsonPropertyName("policy")]
    public DomainDmarcPolicy? Policy { get; set; }

    /// <summary>
    /// The organizational domain whose DMARC record applies, when this domain publishes none of its own.
    /// </summary>
    [Nullable]
    [JsonPropertyName("inherited_from")]
    public string? InheritedFrom { get; set; }

    /// <summary>
    /// When a DNS check first saw the current policy.
    /// </summary>
    [Nullable]
    [JsonPropertyName("policy_since")]
    public DateTime? PolicySince { get; set; }

    /// <summary>
    /// Where the domain is on the path to enforcement: `not_checked` (DNS not checked yet), `no_record`, `monitoring` (`p=none`), `quarantine` or `reject`.
    /// </summary>
    [JsonPropertyName("stage")]
    public required DomainDmarcStage Stage { get; set; }

    /// <summary>
    /// The policy applies only partly (`pct` below 100, or `t=y`).
    /// </summary>
    [JsonPropertyName("partial")]
    public required bool Partial { get; set; }

    /// <summary>
    /// The published record sends aggregate reports to `report_address`.
    /// </summary>
    [JsonPropertyName("reporting")]
    public required bool Reporting { get; set; }

    /// <summary>
    /// Whether `next` is safe to publish now.
    /// </summary>
    [JsonPropertyName("ready")]
    public required bool Ready { get; set; }

    /// <summary>
    /// The next step: `publish` a first record, `add_reporting` (send reports to coss.com), `complete_rollout` (drop `pct`/`t=y`) or `tighten` to the next policy. `null` at `p=reject`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("next")]
    public DomainDmarcNext? Next { get; set; }

    /// <summary>
    /// The readiness checks gating `next`, from the last 14 days of reports.
    /// </summary>
    [JsonPropertyName("checks")]
    public IEnumerable<DomainDmarcChecksItem> Checks { get; set; } =
        new List<DomainDmarcChecksItem>();

    /// <summary>
    /// Things to look at before tightening the policy.
    /// </summary>
    [JsonPropertyName("warnings")]
    public IEnumerable<string> Warnings { get; set; } = new List<string>();

    /// <summary>
    /// What the aggregate reports of this period say.
    /// </summary>
    [JsonPropertyName("report_summary")]
    public required DomainDmarcReportSummary ReportSummary { get; set; }

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
