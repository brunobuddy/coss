using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SmsWebhookEventData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Why the message failed or wasn't delivered.
    /// </summary>
    [Optional]
    [JsonPropertyName("failure")]
    public SmsWebhookEventDataFailure? Failure { get; set; }

    /// <summary>
    /// The provider's or carrier's own error code, e.g. `30007`.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("provider_error_code")]
    public Optional<string?> ProviderErrorCode { get; set; }

    /// <summary>
    /// `sms.suppressed`: the entry that made coss.com skip the number.
    /// </summary>
    [Optional]
    [JsonPropertyName("suppression")]
    public SmsWebhookEventDataSuppression? Suppression { get; set; }

    /// <summary>
    /// The id of the message.
    /// </summary>
    [JsonPropertyName("sms_id")]
    public required string SmsId { get; set; }

    /// <summary>
    /// The number it's sent from.
    /// </summary>
    [JsonPropertyName("from")]
    public required string From { get; set; }

    /// <summary>
    /// The recipient's number.
    /// </summary>
    [JsonPropertyName("to")]
    public required string To { get; set; }

    /// <summary>
    /// The recipient's country (ISO 3166-1 alpha-2).
    /// </summary>
    [JsonPropertyName("country")]
    public required string Country { get; set; }

    /// <summary>
    /// Segments the body takes (what is billed).
    /// </summary>
    [JsonPropertyName("segments")]
    public required long Segments { get; set; }

    /// <summary>
    /// Your tags on the message.
    /// </summary>
    [JsonPropertyName("tags")]
    public IEnumerable<SmsWebhookEventDataTagsItem> Tags { get; set; } =
        new List<SmsWebhookEventDataTagsItem>();

    /// <summary>
    /// Whether it was sent from a sandbox environment: simulated.
    /// </summary>
    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

    /// <summary>
    /// When it happened.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

    /// <summary>
    /// Only for a message sent with a W3C `traceparent` header: that trace context (normalized to version `00`), also sent as this request's `traceparent` header, so handling the event joins the sender's trace.
    /// </summary>
    [Optional]
    [JsonPropertyName("traceparent")]
    public string? Traceparent { get; set; }

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
