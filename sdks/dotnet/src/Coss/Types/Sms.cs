using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record Sms : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SmsObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The number it's sent from, in E.164.
    /// </summary>
    [JsonPropertyName("from")]
    public required string From { get; set; }

    /// <summary>
    /// The recipient's number, in E.164.
    /// </summary>
    [JsonPropertyName("to")]
    public required string To { get; set; }

    /// <summary>
    /// The text. Empty once discarded.
    /// </summary>
    [JsonPropertyName("body")]
    public required string Body { get; set; }

    /// <summary>
    /// `queued` until handed to the carrier (`sent`), then `delivered` or `undelivered` once the carrier reports. `failed`: never sent. `scheduled` and `canceled`: scheduled sends.
    /// </summary>
    [JsonPropertyName("status")]
    public required SmsStatus Status { get; set; }

    /// <summary>
    /// Segments the body takes (what is billed).
    /// </summary>
    [JsonPropertyName("segments")]
    public required long Segments { get; set; }

    /// <summary>
    /// `gsm7` fits the basic alphabet; `ucs2` is used for anything else, with smaller segments.
    /// </summary>
    [JsonPropertyName("encoding")]
    public required SmsEncoding Encoding { get; set; }

    /// <summary>
    /// ISO 3166 country of `to`.
    /// </summary>
    [JsonPropertyName("country")]
    public required string Country { get; set; }

    /// <summary>
    /// Your tags on the message.
    /// </summary>
    [JsonPropertyName("tags")]
    public IEnumerable<SmsTagsItem> Tags { get; set; } = new List<SmsTagsItem>();

    /// <summary>
    /// Why the message failed or wasn't delivered.
    /// </summary>
    [Nullable]
    [JsonPropertyName("failure")]
    public SmsFailure? Failure { get; set; }

    /// <summary>
    /// Sent from a sandbox environment: simulated.
    /// </summary>
    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

    /// <summary>
    /// When it's set to send. `null`: it was sent at once.
    /// </summary>
    [Nullable]
    [JsonPropertyName("scheduled_at")]
    public DateTime? ScheduledAt { get; set; }

    /// <summary>
    /// When it was handed to the carrier. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("sent_at")]
    public DateTime? SentAt { get; set; }

    /// <summary>
    /// When the carrier reported delivery. `null`: not delivered, or not reported.
    /// </summary>
    [Nullable]
    [JsonPropertyName("delivered_at")]
    public DateTime? DeliveredAt { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

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
