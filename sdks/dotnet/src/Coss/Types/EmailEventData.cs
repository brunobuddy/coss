using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Details of the event: only what its `type` has.
/// </summary>
[Serializable]
public record EmailEventData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [Optional]
    [JsonPropertyName("bounce")]
    public EmailEventDataBounce? Bounce { get; set; }

    [Optional]
    [JsonPropertyName("complaint")]
    public EmailEventDataComplaint? Complaint { get; set; }

    [Optional]
    [JsonPropertyName("delay")]
    public EmailEventDataDelay? Delay { get; set; }

    [Optional]
    [JsonPropertyName("delivery")]
    public EmailEventDataDelivery? Delivery { get; set; }

    [Optional]
    [JsonPropertyName("failure")]
    public EmailEventDataFailure? Failure { get; set; }

    /// <summary>
    /// Only for `email.suppressed`: the entry that matched the recipient.
    /// </summary>
    [Optional]
    [JsonPropertyName("suppression")]
    public EmailEventDataSuppression? Suppression { get; set; }

    /// <summary>
    /// Only for `email.suppressed` without `suppression`: the recipient is a contact who unsubscribed (from marketing, or from the email's topic, `topic`).
    /// </summary>
    [Optional]
    [JsonPropertyName("unsubscribe")]
    public EmailEventDataUnsubscribe? Unsubscribe { get; set; }

    /// <summary>
    /// Only for `email.opened`.
    /// </summary>
    [Optional]
    [JsonPropertyName("open")]
    public EmailEventDataOpen? Open { get; set; }

    /// <summary>
    /// Only for `email.clicked`.
    /// </summary>
    [Optional]
    [JsonPropertyName("click")]
    public EmailEventDataClick? Click { get; set; }

    /// <summary>
    /// Only for `email.rescheduled`.
    /// </summary>
    [Optional]
    [JsonPropertyName("reschedule")]
    public EmailEventDataReschedule? Reschedule { get; set; }

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
