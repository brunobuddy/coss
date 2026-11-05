using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingBookingWebhookEvent : IJsonOnDeserialized
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
    public required SchedulingBookingWebhookEventObject Object { get; set; }

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

    /// <summary>
    /// What happened to the booking.
    /// </summary>
    [JsonPropertyName("type")]
    public required SchedulingBookingWebhookEventType Type { get; set; }

    [JsonPropertyName("data")]
    public required SchedulingBookingWebhookData Data { get; set; }

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
