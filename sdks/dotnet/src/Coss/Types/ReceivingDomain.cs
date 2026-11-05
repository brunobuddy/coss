using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// A domain's receiving hostname: email sent to any address at it becomes a received email of its environment.
/// </summary>
[Serializable]
public record ReceivingDomain : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The hostname that receives email: the domain itself or a subdomain of it.
    /// </summary>
    [JsonPropertyName("hostname")]
    public required string Hostname { get; set; }

    /// <summary>
    /// The environment its received emails are delivered to.
    /// </summary>
    [JsonPropertyName("environment_id")]
    public required string EnvironmentId { get; set; }

    /// <summary>
    /// The MX record to publish, with the result of the last check. Mail for the hostname is received as soon as it reaches coss.com; the check only shows what DNS serves.
    /// </summary>
    [JsonPropertyName("record")]
    public required ReceivingDomainRecord Record { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    /// <summary>
    /// When it was last checked. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last_checked_at")]
    public DateTime? LastCheckedAt { get; set; }

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
