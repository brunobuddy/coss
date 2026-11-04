using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record EmailWebhookEventData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [Optional]
    [JsonPropertyName("bounce")]
    public EmailWebhookEventDataBounce? Bounce { get; set; }

    [Optional]
    [JsonPropertyName("complaint")]
    public EmailWebhookEventDataComplaint? Complaint { get; set; }

    [Optional]
    [JsonPropertyName("delay")]
    public EmailWebhookEventDataDelay? Delay { get; set; }

    [Optional]
    [JsonPropertyName("delivery")]
    public EmailWebhookEventDataDelivery? Delivery { get; set; }

    [Optional]
    [JsonPropertyName("failure")]
    public EmailWebhookEventDataFailure? Failure { get; set; }

    /// <summary>
    /// Only for `email.suppressed`: the entry that matched the recipient.
    /// </summary>
    [Optional]
    [JsonPropertyName("suppression")]
    public EmailWebhookEventDataSuppression? Suppression { get; set; }

    /// <summary>
    /// Only for `email.suppressed` without `suppression`: the recipient is a contact who unsubscribed (from marketing, or from the email's topic, `topic`).
    /// </summary>
    [Optional]
    [JsonPropertyName("unsubscribe")]
    public EmailWebhookEventDataUnsubscribe? Unsubscribe { get; set; }

    /// <summary>
    /// Only for `email.opened`.
    /// </summary>
    [Optional]
    [JsonPropertyName("open")]
    public EmailWebhookEventDataOpen? Open { get; set; }

    /// <summary>
    /// Only for `email.clicked`.
    /// </summary>
    [Optional]
    [JsonPropertyName("click")]
    public EmailWebhookEventDataClick? Click { get; set; }

    /// <summary>
    /// Only for `email.rescheduled`.
    /// </summary>
    [Optional]
    [JsonPropertyName("reschedule")]
    public EmailWebhookEventDataReschedule? Reschedule { get; set; }

    [JsonPropertyName("email_id")]
    public required string EmailId { get; set; }

    [JsonPropertyName("from")]
    public required string From { get; set; }

    [JsonPropertyName("to")]
    public IEnumerable<string> To { get; set; } = new List<string>();

    [JsonPropertyName("subject")]
    public required string Subject { get; set; }

    [JsonPropertyName("tags")]
    public IEnumerable<EmailWebhookEventDataTagsItem> Tags { get; set; } =
        new List<EmailWebhookEventDataTagsItem>();

    [Nullable]
    [JsonPropertyName("category")]
    public string? Category { get; set; }

    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

    [Nullable]
    [JsonPropertyName("recipient")]
    public string? Recipient { get; set; }

    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

    /// <summary>
    /// Only for an email sent for a sub-account: its id.
    /// </summary>
    [Optional]
    [JsonPropertyName("subaccount_id")]
    public string? SubaccountId { get; set; }

    /// <summary>
    /// Only for an email sent with a W3C `traceparent` header: that trace context (normalized to version `00`), also sent as this request's `traceparent` header, so handling the event joins the sender's trace.
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
