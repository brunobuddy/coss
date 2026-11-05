using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingCalendarDelegation : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingCalendarDelegationObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("provider")]
    public required SchedulingCalendarDelegationProvider Provider { get; set; }

    [JsonPropertyName("domain")]
    public required string Domain { get; set; }

    /// <summary>
    /// `pending`: not verified yet. `failing`: the provider refused access, and its hosts aren't offered until it's back. `deleting`: its connections are being removed.
    /// </summary>
    [JsonPropertyName("status")]
    public required SchedulingCalendarDelegationStatus Status { get; set; }

    [JsonPropertyName("match_host_email")]
    public required bool MatchHostEmail { get; set; }

    /// <summary>
    /// Google: the numeric client ID your Workspace admin authorizes.
    /// </summary>
    [JsonPropertyName("client_id")]
    public required string ClientId { get; set; }

    [Nullable]
    [JsonPropertyName("tenant_id")]
    public string? TenantId { get; set; }

    /// <summary>
    /// What to authorize: OAuth scopes in Google's Admin console, the application permission in Entra.
    /// </summary>
    [JsonPropertyName("scopes")]
    public IEnumerable<string> Scopes { get; set; } = new List<string>();

    [Nullable]
    [JsonPropertyName("verified_account")]
    public string? VerifiedAccount { get; set; }

    [Nullable]
    [JsonPropertyName("last_error_code")]
    public string? LastErrorCode { get; set; }

    [Nullable]
    [JsonPropertyName("failing_since")]
    public string? FailingSince { get; set; }

    [Nullable]
    [JsonPropertyName("secret_expires_at")]
    public string? SecretExpiresAt { get; set; }

    [JsonPropertyName("hosts_connected")]
    public required long HostsConnected { get; set; }

    /// <summary>
    /// Hosts whose mailbox can't be reached, or who are out while this is `failing`.
    /// </summary>
    [JsonPropertyName("hosts_failed")]
    public required long HostsFailed { get; set; }

    [JsonPropertyName("created_at")]
    public required string CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required string UpdatedAt { get; set; }

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
