using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record UpdateCalendarDelegationRequest
{
    /// <summary>
    /// The delegation's id.
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    /// <summary>
    /// Whether a host's `email` picks their mailbox when `calendar_account` isn't set. Turn it off if end users can type their own email into your app: otherwise one could name a colleague's address and reach that calendar.
    /// </summary>
    [Optional]
    [JsonPropertyName("match_host_email")]
    public bool? MatchHostEmail { get; set; }

    /// <summary>
    /// A new key. It's tried on the verified mailbox before it replaces the old one.
    /// </summary>
    [Optional]
    [JsonPropertyName("service_account_key")]
    public string? ServiceAccountKey { get; set; }

    /// <summary>
    /// A new client secret. It's tried on the verified mailbox before it replaces the old one.
    /// </summary>
    [Optional]
    [JsonPropertyName("client_secret")]
    public string? ClientSecret { get; set; }

    /// <summary>
    /// When the Entra client secret expires. Owners and admins are warned 14 days before.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("secret_expires_at")]
    public Optional<DateTime?> SecretExpiresAt { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
