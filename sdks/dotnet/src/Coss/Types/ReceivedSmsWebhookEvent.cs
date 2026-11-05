using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record ReceivedSmsWebhookEvent : IJsonOnDeserialized
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
    public required ReceivedSmsWebhookEventObject Object { get; set; }

    /// <summary>
    /// `sms.received`: a message arrived. `sms.opted_out`: the sender replied with an opt-out keyword. `sms.opted_in`: the sender replied with an opt-in keyword.
    /// </summary>
    [JsonPropertyName("type")]
    public required ReceivedSmsWebhookEventType Type { get; set; }

    /// <summary>
    /// The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.
    /// </summary>
    [JsonPropertyName("api_version")]
    public required string ApiVersion { get; set; }

    /// <summary>
    /// When the event was created.
    /// </summary>
    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("data")]
    public required ReceivedSmsWebhookEventData Data { get; set; }

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
