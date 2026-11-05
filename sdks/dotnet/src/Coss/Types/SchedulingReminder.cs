using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingReminder : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// What webhooks and the booking call this reminder.
    /// </summary>
    [JsonPropertyName("key")]
    public required string Key { get; set; }

    /// <summary>
    /// The moment this is timed from.
    /// </summary>
    [JsonPropertyName("anchor")]
    public required SchedulingReminderAnchor Anchor { get; set; }

    /// <summary>
    /// How long before the anchor. `null` when it's after.
    /// </summary>
    [Nullable]
    [JsonPropertyName("before_minutes")]
    public double? BeforeMinutes { get; set; }

    /// <summary>
    /// How long after the anchor. `null` when it's before.
    /// </summary>
    [Nullable]
    [JsonPropertyName("after_minutes")]
    public double? AfterMinutes { get; set; }

    /// <summary>
    /// Who hears about it. `webhook` fires `scheduling.booking.reminder`.
    /// </summary>
    [JsonPropertyName("send")]
    public IEnumerable<SchedulingReminderSendItem> Send { get; set; } =
        new List<SchedulingReminderSendItem>();

    /// <summary>
    /// Fixed addresses that are emailed as well.
    /// </summary>
    [JsonPropertyName("email_to")]
    public IEnumerable<string> EmailTo { get; set; } = new List<string>();

    /// <summary>
    /// Your own subject. `null`: the standard one.
    /// </summary>
    [Nullable]
    [JsonPropertyName("subject")]
    public string? Subject { get; set; }

    /// <summary>
    /// Your own words in the email. `null`: the standard ones.
    /// </summary>
    [Nullable]
    [JsonPropertyName("message")]
    public string? Message { get; set; }

    /// <summary>
    /// Your own text. `null`: the standard one.
    /// </summary>
    [Nullable]
    [JsonPropertyName("sms_message")]
    public string? SmsMessage { get; set; }

    /// <summary>
    /// One button in the email. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("button")]
    public SchedulingReminderButton? Button { get; set; }

    /// <summary>
    /// Whether the emails carry the invitation.
    /// </summary>
    [JsonPropertyName("include_invite")]
    public required bool IncludeInvite { get; set; }

    /// <summary>
    /// Whether it goes right away if booked after its moment, instead of being skipped.
    /// </summary>
    [JsonPropertyName("send_if_late")]
    public required bool SendIfLate { get; set; }

    /// <summary>
    /// Whether it's dropped once the booking is marked a no-show.
    /// </summary>
    [JsonPropertyName("skip_no_show")]
    public required bool SkipNoShow { get; set; }

    /// <summary>
    /// Only for bookings matching all of this. `null`: every booking.
    /// </summary>
    [Nullable]
    [JsonPropertyName("only_if")]
    public SchedulingReminderOnlyIf? OnlyIf { get; set; }

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
