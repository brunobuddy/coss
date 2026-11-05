using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record WebhookAttempt : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required WebhookAttemptObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// When the attempt ran.
    /// </summary>
    [JsonPropertyName("attempted_at")]
    public required DateTime AttemptedAt { get; set; }

    /// <summary>
    /// The endpoint's HTTP status; `null` when no response arrived.
    /// </summary>
    [Nullable]
    [JsonPropertyName("status_code")]
    public long? StatusCode { get; set; }

    /// <summary>
    /// How long it took, in milliseconds.
    /// </summary>
    [JsonPropertyName("duration_ms")]
    public required long DurationMs { get; set; }

    /// <summary>
    /// Why the attempt failed (e.g. `HTTP 500`, a timeout); `null` on success.
    /// </summary>
    [Nullable]
    [JsonPropertyName("error")]
    public string? Error { get; set; }

    /// <summary>
    /// At most 1 KB of the response body, as text.
    /// </summary>
    [Nullable]
    [JsonPropertyName("response_excerpt")]
    public string? ResponseExcerpt { get; set; }

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
