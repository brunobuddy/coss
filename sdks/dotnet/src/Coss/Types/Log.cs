using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record Log : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required LogObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// When it happened.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

    [JsonPropertyName("source")]
    public required LogSource Source { get; set; }

    [JsonPropertyName("level")]
    public required LogLevel Level { get; set; }

    /// <summary>
    /// `api.request`, `webhook.attempt`, `webhook.forward` (an event `coss listen` forwarded), or an email event type such as `email.delivered`.
    /// </summary>
    [JsonPropertyName("type")]
    public required string Type { get; set; }

    /// <summary>
    /// A one-line summary.
    /// </summary>
    [JsonPropertyName("message")]
    public required string Message { get; set; }

    /// <summary>
    /// The `X-Request-Id` of the API request this line belongs to.
    /// </summary>
    [Nullable]
    [JsonPropertyName("request_id")]
    public string? RequestId { get; set; }

    /// <summary>
    /// The API key that made the request. `null`: not an API request.
    /// </summary>
    [Nullable]
    [JsonPropertyName("api_key_id")]
    public string? ApiKeyId { get; set; }

    /// <summary>
    /// The HTTP method. `null`: not an HTTP line.
    /// </summary>
    [Nullable]
    [JsonPropertyName("method")]
    public string? Method { get; set; }

    /// <summary>
    /// The request's path. `null`: not an API request.
    /// </summary>
    [Nullable]
    [JsonPropertyName("path")]
    public string? Path { get; set; }

    /// <summary>
    /// The matched route, e.g. `/v1/emails/:id`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("route")]
    public string? Route { get; set; }

    /// <summary>
    /// The API response status, or the webhook endpoint's response status.
    /// </summary>
    [Nullable]
    [JsonPropertyName("status_code")]
    public long? StatusCode { get; set; }

    /// <summary>
    /// How long it took, in milliseconds. `null`: not timed.
    /// </summary>
    [Nullable]
    [JsonPropertyName("duration_ms")]
    public long? DurationMs { get; set; }

    /// <summary>
    /// The caller's address. `null`: not an API request.
    /// </summary>
    [Nullable]
    [JsonPropertyName("client_ip")]
    public string? ClientIp { get; set; }

    /// <summary>
    /// The caller's `User-Agent`. `null`: not sent.
    /// </summary>
    [Nullable]
    [JsonPropertyName("user_agent")]
    public string? UserAgent { get; set; }

    /// <summary>
    /// The error's `code`. `null`: no error.
    /// </summary>
    [Nullable]
    [JsonPropertyName("error_code")]
    public string? ErrorCode { get; set; }

    /// <summary>
    /// What the line is about: `email`, `domain`, `webhook_endpoint`…
    /// </summary>
    [Nullable]
    [JsonPropertyName("resource_type")]
    public string? ResourceType { get; set; }

    /// <summary>
    /// The id of what it's about. `null`: nothing in particular.
    /// </summary>
    [Nullable]
    [JsonPropertyName("resource_id")]
    public string? ResourceId { get; set; }

    /// <summary>
    /// The recipient an email event is about. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("recipient")]
    public string? Recipient { get; set; }

    /// <summary>
    /// Details: redacted request and response bodies for API requests (secrets, attachment contents and long strings are never stored), event data for emails and webhooks.
    /// </summary>
    [JsonPropertyName("attributes")]
    public Dictionary<string, object?> Attributes { get; set; } = new Dictionary<string, object?>();

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
