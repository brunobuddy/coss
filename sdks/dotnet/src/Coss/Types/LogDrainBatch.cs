using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record LogDrainBatch : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required LogDrainBatchObject Object { get; set; }

    /// <summary>
    /// The batch's id: the `webhook-id` header, the same on every attempt.
    /// </summary>
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The id of the drain it's posted to.
    /// </summary>
    [JsonPropertyName("drain_id")]
    public required string DrainId { get; set; }

    [JsonPropertyName("status")]
    public required LogDrainBatchStatus Status { get; set; }

    /// <summary>
    /// Lines in the batch.
    /// </summary>
    [JsonPropertyName("line_count")]
    public required long LineCount { get; set; }

    /// <summary>
    /// Size of the request body in bytes.
    /// </summary>
    [JsonPropertyName("byte_size")]
    public required long ByteSize { get; set; }

    /// <summary>
    /// How many attempts were made so far.
    /// </summary>
    [JsonPropertyName("attempt_count")]
    public required long AttemptCount { get; set; }

    /// <summary>
    /// When the next attempt is due; `null` once the batch is finished.
    /// </summary>
    [Nullable]
    [JsonPropertyName("next_attempt_at")]
    public DateTime? NextAttemptAt { get; set; }

    /// <summary>
    /// The drain's HTTP status on the latest attempt. `null`: no response arrived, or no attempt yet.
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
    /// Every HTTP attempt of this batch, oldest first.
    /// </summary>
    [JsonPropertyName("attempts")]
    public IEnumerable<LogDrainAttempt> Attempts { get; set; } = new List<LogDrainAttempt>();

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
