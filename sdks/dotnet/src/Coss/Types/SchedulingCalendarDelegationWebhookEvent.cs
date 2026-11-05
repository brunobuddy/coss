using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingCalendarDelegationWebhookEvent : IJsonOnDeserialized
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
    public required SchedulingCalendarDelegationWebhookEventObject Object { get; set; }

    /// <summary>
    /// The API version this payload is rendered in: the endpoint's.
    /// </summary>
    [JsonPropertyName("api_version")]
    public required string ApiVersion { get; set; }

    /// <summary>
    /// When the event was created.
    /// </summary>
    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("type")]
    public required SchedulingCalendarDelegationWebhookEventType Type { get; set; }

    [JsonPropertyName("data")]
    public required SchedulingCalendarDelegationWebhookEventData Data { get; set; }

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
