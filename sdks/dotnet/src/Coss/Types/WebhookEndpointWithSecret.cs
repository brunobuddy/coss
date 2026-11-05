using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record WebhookEndpointWithSecret : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required WebhookEndpointWithSecretObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// Where events are posted.
    /// </summary>
    [JsonPropertyName("url")]
    public required string Url { get; set; }

    /// <summary>
    /// Your note about it. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    /// <summary>
    /// Event types delivered to this endpoint. An empty array means every event type, including ones added later.
    /// </summary>
    [JsonPropertyName("event_types")]
    public IEnumerable<string> EventTypes { get; set; } = new List<string>();

    /// <summary>
    /// The API version (`Coss-Version`) events are rendered in for this endpoint. Each event carries it as `api_version`.
    /// </summary>
    [JsonPropertyName("api_version")]
    public required string ApiVersion { get; set; }

    /// <summary>
    /// A disabled endpoint receives nothing until it is enabled again.
    /// </summary>
    [JsonPropertyName("enabled")]
    public required bool Enabled { get; set; }

    /// <summary>
    /// `manual`: someone disabled it. `failing`: its deliveries failed every attempt for five days, so coss.com disabled it. `null` while enabled.
    /// </summary>
    [Nullable]
    [JsonPropertyName("disabled_reason")]
    public WebhookEndpointWithSecretDisabledReason? DisabledReason { get; set; }

    /// <summary>
    /// When it was disabled. `null` while enabled.
    /// </summary>
    [Nullable]
    [JsonPropertyName("disabled_at")]
    public DateTime? DisabledAt { get; set; }

    /// <summary>
    /// When the endpoint's current run of failed deliveries began (a delivery that failed every attempt); cleared by the next successful delivery. An endpoint failing for five days is disabled. `null` while healthy.
    /// </summary>
    [Nullable]
    [JsonPropertyName("failing_since")]
    public DateTime? FailingSince { get; set; }

    /// <summary>
    /// After a secret roll, deliveries are also signed with the previous secret until this time. `null` when only the current secret signs.
    /// </summary>
    [Nullable]
    [JsonPropertyName("previous_secret_expires_at")]
    public DateTime? PreviousSecretExpiresAt { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required DateTime UpdatedAt { get; set; }

    /// <summary>
    /// The endpoint's `whsec_…` signing secret, used to verify the requests coss.com sends. Returned only when the endpoint is created and when its secret is rolled — store it now; it cannot be read back through the API.
    /// </summary>
    [JsonPropertyName("secret")]
    public required string Secret { get; set; }

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
