using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record HookDelivery : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required HookDeliveryObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The id of the application.
    /// </summary>
    [JsonPropertyName("application_id")]
    public required string ApplicationId { get; set; }

    /// <summary>
    /// The id of the message being delivered.
    /// </summary>
    [JsonPropertyName("message_id")]
    public required string MessageId { get; set; }

    /// <summary>
    /// The id of the endpoint it's delivered to.
    /// </summary>
    [JsonPropertyName("endpoint_id")]
    public required string EndpointId { get; set; }

    /// <summary>
    /// `pending`: waiting for its next attempt. `succeeded`: the endpoint answered 2xx. `failed`: every attempt failed, or the endpoint was disabled or deleted.
    /// </summary>
    [JsonPropertyName("status")]
    public required HookDeliveryStatus Status { get; set; }

    /// <summary>
    /// How many attempts were made so far.
    /// </summary>
    [JsonPropertyName("attempt_count")]
    public required long AttemptCount { get; set; }

    /// <summary>
    /// When the next attempt runs. `null`: none is due, because it finished.
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

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    /// <summary>
    /// When it `succeeded` or `failed`. `null`: still `pending`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("finished_at")]
    public DateTime? FinishedAt { get; set; }

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
