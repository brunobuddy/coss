using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record Domain : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required DomainObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The domain, lower-cased.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// `pending` while the records are being checked, `verified` once they are, `temporary_failure` after a transient DNS problem, and `failed` when verification gave up (72 hours) — restart it with the verify endpoint. `deleting` is a removal in progress.
    /// </summary>
    [JsonPropertyName("status")]
    public required DomainStatus Status { get; set; }

    /// <summary>
    /// Whether live keys may send from this domain right now.
    /// </summary>
    [JsonPropertyName("can_send")]
    public required bool CanSend { get; set; }

    /// <summary>
    /// The provider region it sends from. `null`: not set up there.
    /// </summary>
    [Nullable]
    [JsonPropertyName("region")]
    public string? Region { get; set; }

    /// <summary>
    /// The envelope sender subdomain bounces come back to.
    /// </summary>
    [JsonPropertyName("mail_from_domain")]
    public required string MailFromDomain { get; set; }

    /// <summary>
    /// How setting up its bounce-handling `MAIL FROM` domain went.
    /// </summary>
    [JsonPropertyName("mail_from_status")]
    public required DomainMailFromStatus MailFromStatus { get; set; }

    /// <summary>
    /// The DNS records to publish, with the result of the last check.
    /// </summary>
    [JsonPropertyName("records")]
    public IEnumerable<DomainRecord> Records { get; set; } = new List<DomainRecord>();

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    /// <summary>
    /// When DNS was last checked. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last_checked_at")]
    public DateTime? LastCheckedAt { get; set; }

    /// <summary>
    /// When it was verified. `null`: it isn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("verified_at")]
    public DateTime? VerifiedAt { get; set; }

    /// <summary>
    /// When verification failed. `null`: it hasn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("failed_at")]
    public DateTime? FailedAt { get; set; }

    [Nullable]
    [JsonPropertyName("tracking")]
    public TrackingDomain? Tracking { get; set; }

    [Nullable]
    [JsonPropertyName("receiving")]
    public ReceivingDomain? Receiving { get; set; }

    [JsonPropertyName("bimi")]
    public required DomainBimi Bimi { get; set; }

    /// <summary>
    /// The sub-account the domain belongs to (only it sends from it, with its own reputation); `null` for the organization's own.
    /// </summary>
    [Nullable]
    [JsonPropertyName("subaccount_id")]
    public string? SubaccountId { get; set; }

    /// <summary>
    /// An organization's domain its sub-accounts may send from too.
    /// </summary>
    [JsonPropertyName("shared_with_subaccounts")]
    public required bool SharedWithSubaccounts { get; set; }

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
