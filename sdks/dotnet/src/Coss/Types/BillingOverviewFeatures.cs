using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Which features the plan includes.
/// </summary>
[Serializable]
public record BillingOverviewFeatures : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Custom tracking domains.
    /// </summary>
    [JsonPropertyName("tracking_domains")]
    public required bool TrackingDomains { get; set; }

    /// <summary>
    /// The organization's audit log.
    /// </summary>
    [JsonPropertyName("audit_log")]
    public required bool AuditLog { get; set; }

    /// <summary>
    /// Log drains.
    /// </summary>
    [JsonPropertyName("log_drains")]
    public required bool LogDrains { get; set; }

    /// <summary>
    /// Single sign-on.
    /// </summary>
    [JsonPropertyName("sso")]
    public required bool Sso { get; set; }

    /// <summary>
    /// Directory sync (SCIM).
    /// </summary>
    [JsonPropertyName("scim")]
    public required bool Scim { get; set; }

    /// <summary>
    /// Dedicated IP pools.
    /// </summary>
    [JsonPropertyName("dedicated_ips")]
    public required bool DedicatedIps { get; set; }

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
