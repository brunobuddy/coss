using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// What the address says. `null` on an assessment with no email.
/// </summary>
[Serializable]
public record RiskEmailSignals : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// `null` once the address is removed (90 days after the assessment).
    /// </summary>
    [Nullable]
    [JsonPropertyName("domain")]
    public string? Domain { get; set; }

    /// <summary>
    /// Whether it's syntactically valid.
    /// </summary>
    [JsonPropertyName("valid")]
    public required bool Valid { get; set; }

    /// <summary>
    /// Whether its domain is a known burner service.
    /// </summary>
    [JsonPropertyName("disposable")]
    public required bool Disposable { get; set; }

    /// <summary>
    /// From DNS (MX, A, AAAA). `unknown` when the lookup failed or timed out.
    /// </summary>
    [JsonPropertyName("deliverability")]
    public required RiskEmailSignalsDeliverability Deliverability { get; set; }

    /// <summary>
    /// Whether it's a role mailbox, like `info@`.
    /// </summary>
    [JsonPropertyName("role_account")]
    public required bool RoleAccount { get; set; }

    /// <summary>
    /// Whether its domain is a free mailbox provider.
    /// </summary>
    [JsonPropertyName("free_provider")]
    public required bool FreeProvider { get; set; }

    /// <summary>
    /// `email.typo`: the likely intended domain. `null` otherwise.
    /// </summary>
    [Nullable]
    [JsonPropertyName("suggestion")]
    public string? Suggestion { get; set; }

    /// <summary>
    /// Days since the domain was registered (RDAP); `null` when unknown or not looked up (free providers, disposable domains).
    /// </summary>
    [Nullable]
    [JsonPropertyName("domain_age_days")]
    public long? DomainAgeDays { get; set; }

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
