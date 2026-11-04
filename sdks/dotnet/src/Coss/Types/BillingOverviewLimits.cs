using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Resource limits (`null`: unlimited).
/// </summary>
[Serializable]
public record BillingOverviewLimits : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Sending domains. `null`: unlimited.
    /// </summary>
    [Nullable]
    [JsonPropertyName("domains")]
    public long? Domains { get; set; }

    /// <summary>
    /// Members of the organization. `null`: unlimited.
    /// </summary>
    [Nullable]
    [JsonPropertyName("members")]
    public long? Members { get; set; }

    /// <summary>
    /// Webhook endpoints per environment. `null`: unlimited.
    /// </summary>
    [Nullable]
    [JsonPropertyName("webhook_endpoints_per_environment")]
    public long? WebhookEndpointsPerEnvironment { get; set; }

    /// <summary>
    /// Contacts per environment. `null`: unlimited.
    /// </summary>
    [Nullable]
    [JsonPropertyName("contacts_per_environment")]
    public long? ContactsPerEnvironment { get; set; }

    /// <summary>
    /// Inboxes. `null`: unlimited.
    /// </summary>
    [Nullable]
    [JsonPropertyName("inboxes")]
    public long? Inboxes { get; set; }

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
