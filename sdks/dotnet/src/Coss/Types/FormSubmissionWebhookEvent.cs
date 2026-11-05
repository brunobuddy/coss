using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record FormSubmissionWebhookEvent : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The event id.
    /// </summary>
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("object")]
    public required FormSubmissionWebhookEventObject Object { get; set; }

    /// <summary>
    /// `received`: a submission was accepted (at once, after the submitter confirmed, or released from review). `flagged`: Risk held it for review or refused it (honeypot catches send nothing).
    /// </summary>
    [JsonPropertyName("type")]
    public required FormSubmissionWebhookEventType Type { get; set; }

    /// <summary>
    /// The API version the payload is rendered in (your endpoint's version).
    /// </summary>
    [JsonPropertyName("api_version")]
    public required string ApiVersion { get; set; }

    /// <summary>
    /// When the event was created.
    /// </summary>
    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    /// <summary>
    /// The submission.
    /// </summary>
    [JsonPropertyName("data")]
    public required FormSubmissionWebhookEventData Data { get; set; }

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
