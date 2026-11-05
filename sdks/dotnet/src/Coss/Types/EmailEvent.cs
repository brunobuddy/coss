using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record EmailEvent : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required EmailEventObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The email's id.
    /// </summary>
    [JsonPropertyName("email_id")]
    public required string EmailId { get; set; }

    /// <summary>
    /// What happened, such as `email.delivered` or `email.bounced`.
    /// </summary>
    [JsonPropertyName("type")]
    public required EmailEventType Type { get; set; }

    /// <summary>
    /// The recipient this event is about; `null` for the whole email.
    /// </summary>
    [Nullable]
    [JsonPropertyName("recipient")]
    public string? Recipient { get; set; }

    /// <summary>
    /// When it happened.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

    [JsonPropertyName("data")]
    public required EmailEventData Data { get; set; }

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
