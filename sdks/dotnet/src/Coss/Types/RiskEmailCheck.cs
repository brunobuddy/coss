using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record RiskEmailCheck : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required RiskEmailCheckObject Object { get; set; }

    /// <summary>
    /// The address checked.
    /// </summary>
    [JsonPropertyName("email")]
    public required string Email { get; set; }

    /// <summary>
    /// Syntactically valid (the rest assumes it is).
    /// </summary>
    [JsonPropertyName("valid")]
    public required bool Valid { get; set; }

    /// <summary>
    /// Its domain. `null` when it isn't valid.
    /// </summary>
    [Nullable]
    [JsonPropertyName("domain")]
    public string? Domain { get; set; }

    /// <summary>
    /// The mailbox with the provider's aliasing folded (dots and `+tags` at Gmail…): two addresses with the same canonical form reach one inbox.
    /// </summary>
    [Nullable]
    [JsonPropertyName("canonical")]
    public string? Canonical { get; set; }

    /// <summary>
    /// Whether its domain is a known burner service.
    /// </summary>
    [JsonPropertyName("disposable")]
    public required bool Disposable { get; set; }

    /// <summary>
    /// From DNS (MX, A, AAAA). `unknown` when the lookup failed or timed out.
    /// </summary>
    [JsonPropertyName("deliverability")]
    public required RiskEmailCheckDeliverability Deliverability { get; set; }

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
    /// The likely intended domain when this one looks like a typo of a popular one.
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

    /// <summary>
    /// Lookups that failed or timed out (their fields are `unknown`/`null`).
    /// </summary>
    [JsonPropertyName("degraded")]
    public IEnumerable<RiskEmailCheckDegradedItem> Degraded { get; set; } =
        new List<RiskEmailCheckDegradedItem>();

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
