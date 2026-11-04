using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record CreateCalendarDelegationRequestMicrosoft : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The Workspace or Microsoft 365 domain. Only addresses on exactly this domain connect, not its subdomains.
    /// </summary>
    [JsonPropertyName("domain")]
    public required string Domain { get; set; }

    /// <summary>
    /// Whether a host's `email` picks their mailbox when `calendar_account` isn't set. Turn it off if end users can type their own email into your app: otherwise one could name a colleague's address and reach that calendar.
    /// </summary>
    [Optional]
    [JsonPropertyName("match_host_email")]
    public bool? MatchHostEmail { get; set; }

    /// <summary>
    /// The Directory (tenant) ID.
    /// </summary>
    [JsonPropertyName("tenant_id")]
    public required string TenantId { get; set; }

    /// <summary>
    /// The Application (client) ID.
    /// </summary>
    [JsonPropertyName("client_id")]
    public required string ClientId { get; set; }

    /// <summary>
    /// A client secret of that app. Never returned.
    /// </summary>
    [JsonPropertyName("client_secret")]
    public required string ClientSecret { get; set; }

    /// <summary>
    /// When the Entra client secret expires. Owners and admins are warned 14 days before.
    /// </summary>
    [Optional]
    [JsonPropertyName("secret_expires_at")]
    public DateTime? SecretExpiresAt { get; set; }

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
