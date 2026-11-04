using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record RiskWebhookEvent : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The event id, also sent as the `webhook-id` header.
    /// </summary>
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("object")]
    public required RiskWebhookEventObject Object { get; set; }

    /// <summary>
    /// What happened to the assessment.
    /// </summary>
    [JsonPropertyName("type")]
    public required RiskWebhookEventType Type { get; set; }

    /// <summary>
    /// The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.
    /// </summary>
    [JsonPropertyName("api_version")]
    public required string ApiVersion { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    /// <summary>
    /// The assessment, without its signals.
    /// </summary>
    [JsonPropertyName("data")]
    public required RiskWebhookEventData Data { get; set; }

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
