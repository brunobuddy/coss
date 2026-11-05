using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// A domain's custom tracking domain: open pixels and click redirects of emails sent from the domain use it while it is `active`.
/// </summary>
[Serializable]
public record TrackingDomain : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The tracking hostname, a subdomain of the domain.
    /// </summary>
    [JsonPropertyName("hostname")]
    public required string Hostname { get; set; }

    /// <summary>
    /// `pending` until the CNAME points at coss.com and its certificate is issued, `active` once links and open pixels of emails sent from the domain use it, `temporary_failure` when an active hostname stopped working (emails fall back to the default tracking host meanwhile), `failed` when setup gave up (72 hours) — restart it with the domain's verify endpoint. `deleting` is a removal in progress.
    /// </summary>
    [JsonPropertyName("status")]
    public required TrackingDomainStatus Status { get; set; }

    /// <summary>
    /// The DNS record to publish, with the result of the last check.
    /// </summary>
    [JsonPropertyName("record")]
    public required TrackingDomainRecord Record { get; set; }

    /// <summary>
    /// What is holding the hostname up, when the certificate provider said.
    /// </summary>
    [Nullable]
    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    /// <summary>
    /// When it was last checked. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last_checked_at")]
    public DateTime? LastCheckedAt { get; set; }

    /// <summary>
    /// When it became active. `null`: it isn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("activated_at")]
    public DateTime? ActivatedAt { get; set; }

    /// <summary>
    /// When it failed. `null`: it hasn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("failed_at")]
    public DateTime? FailedAt { get; set; }

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
