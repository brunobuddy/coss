using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SmsEvent : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SmsEventObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The id of the message.
    /// </summary>
    [JsonPropertyName("sms_id")]
    public required string SmsId { get; set; }

    /// <summary>
    /// What happened: `sms.scheduled`, `sms.sent`, `sms.delivered`, `sms.undelivered`, `sms.failed`, `sms.suppressed` or `sms.canceled`.
    /// </summary>
    [JsonPropertyName("type")]
    public required SmsEventType Type { get; set; }

    /// <summary>
    /// When it happened.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

    [JsonPropertyName("data")]
    public required SmsEventData Data { get; set; }

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
