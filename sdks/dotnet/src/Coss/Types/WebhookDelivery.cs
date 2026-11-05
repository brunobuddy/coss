using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record WebhookDelivery : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required WebhookDeliveryObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The id of the endpoint it's delivered to.
    /// </summary>
    [JsonPropertyName("endpoint_id")]
    public required string EndpointId { get; set; }

    /// <summary>
    /// The event's id: the `id` of the payload and the `webhook-id` header.
    /// </summary>
    [JsonPropertyName("event_id")]
    public required string EventId { get; set; }

    [JsonPropertyName("event_type")]
    public required string EventType { get; set; }

    [JsonPropertyName("status")]
    public required WebhookDeliveryStatus Status { get; set; }

    /// <summary>
    /// How many attempts were made so far.
    /// </summary>
    [JsonPropertyName("attempt_count")]
    public required long AttemptCount { get; set; }

    /// <summary>
    /// When the next attempt is due; `null` once the delivery is finished.
    /// </summary>
    [Nullable]
    [JsonPropertyName("next_attempt_at")]
    public DateTime? NextAttemptAt { get; set; }

    /// <summary>
    /// The endpoint's HTTP status on the latest attempt. `null`: no response arrived, or no attempt yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last_status_code")]
    public long? LastStatusCode { get; set; }

    /// <summary>
    /// Why the latest attempt failed. `null`: it didn't, or no attempt yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last_error")]
    public string? LastError { get; set; }

    /// <summary>
    /// The event body, exactly as posted to the endpoint.
    /// </summary>
    [JsonPropertyName("payload")]
    public Dictionary<string, object?> Payload { get; set; } = new Dictionary<string, object?>();

    /// <summary>
    /// Every HTTP attempt of this delivery, oldest first.
    /// </summary>
    [JsonPropertyName("attempts")]
    public IEnumerable<WebhookAttempt> Attempts { get; set; } = new List<WebhookAttempt>();

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required DateTime UpdatedAt { get; set; }

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
