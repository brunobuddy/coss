using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record CreateCalendarDelegationRequestGoogle : IJsonOnDeserialized
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
    /// The whole JSON key of a service account in your Google Cloud project. Never returned.
    /// </summary>
    [JsonPropertyName("service_account_key")]
    public required string ServiceAccountKey { get; set; }

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
