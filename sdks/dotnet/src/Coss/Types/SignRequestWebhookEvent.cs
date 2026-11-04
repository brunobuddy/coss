using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SignRequestWebhookEvent : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The event id: the same as the audit trail's `SignEvent.id`.
    /// </summary>
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("object")]
    public required SignRequestWebhookEventObject Object { get; set; }

    /// <summary>
    /// `sent`: sent to signers. `viewed`: a signer opened it. `signer_signed`: a signer signed. `declined`: a signer declined. `completed`: the sealed document is ready to download. `canceled` and `expired`: it ended unsigned.
    /// </summary>
    [JsonPropertyName("type")]
    public required SignRequestWebhookEventType Type { get; set; }

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
    /// The request. Never documents or field values.
    /// </summary>
    [JsonPropertyName("data")]
    public required SignRequestWebhookEventData Data { get; set; }

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
