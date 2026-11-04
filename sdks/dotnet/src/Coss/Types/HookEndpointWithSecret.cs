using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record HookEndpointWithSecret : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required HookEndpointWithSecretObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The id of the application it belongs to.
    /// </summary>
    [JsonPropertyName("application_id")]
    public required string ApplicationId { get; set; }

    /// <summary>
    /// Where deliveries are sent.
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
    /// Only these event types are delivered. Empty: every type.
    /// </summary>
    [JsonPropertyName("filter_types")]
    public IEnumerable<string> FilterTypes { get; set; } = new List<string>();

    /// <summary>
    /// At most this many requests per second to this endpoint. `null`: no limit of its own.
    /// </summary>
    [Nullable]
    [JsonPropertyName("rate_limit_per_second")]
    public long? RateLimitPerSecond { get; set; }

    /// <summary>
    /// Whether new messages are delivered to it.
    /// </summary>
    [JsonPropertyName("enabled")]
    public required bool Enabled { get; set; }

    /// <summary>
    /// `manual`: disabled by you or its user. `failing`: its deliveries failed every attempt for five days, so coss.com disabled it. `null` while enabled.
    /// </summary>
    [Nullable]
    [JsonPropertyName("disabled_reason")]
    public HookEndpointWithSecretDisabledReason? DisabledReason { get; set; }

    /// <summary>
    /// When it was disabled. `null`: it's enabled.
    /// </summary>
    [Nullable]
    [JsonPropertyName("disabled_at")]
    public DateTime? DisabledAt { get; set; }

    /// <summary>
    /// When its current run of failed deliveries began; cleared by the next success. `null` while healthy.
    /// </summary>
    [Nullable]
    [JsonPropertyName("failing_since")]
    public DateTime? FailingSince { get; set; }

    /// <summary>
    /// After a secret roll, requests are also signed with the previous secret until then.
    /// </summary>
    [Nullable]
    [JsonPropertyName("previous_secret_expires_at")]
    public DateTime? PreviousSecretExpiresAt { get; set; }

    /// <summary>
    /// Your own key-value pairs.
    /// </summary>
    [JsonPropertyName("metadata")]
    public Dictionary<string, string> Metadata { get; set; } = new Dictionary<string, string>();

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required DateTime UpdatedAt { get; set; }

    /// <summary>
    /// The endpoint's `whsec_…` signing secret (Standard Webhooks).
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
