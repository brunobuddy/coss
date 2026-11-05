using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingReminderInput : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Names this reminder in webhooks and on the booking. Default: from its timing, like `start-1440`.
    /// </summary>
    [Optional]
    [JsonPropertyName("key")]
    public string? Key { get; set; }

    /// <summary>
    /// The moment this is timed from.
    /// </summary>
    [JsonPropertyName("anchor")]
    public required SchedulingReminderInputAnchor Anchor { get; set; }

    /// <summary>
    /// How long before the anchor. Only for `start` and `end`.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("before_minutes")]
    public Optional<int?> BeforeMinutes { get; set; }

    /// <summary>
    /// How long after the anchor, up to 60 days. Default for other anchors: 0.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("after_minutes")]
    public Optional<int?> AfterMinutes { get; set; }

    /// <summary>
    /// Who hears about it. `webhook` fires `scheduling.booking.reminder`.
    /// </summary>
    [Optional]
    [JsonPropertyName("send")]
    public IEnumerable<SchedulingReminderInputSendItem>? Send { get; set; }

    /// <summary>
    /// Fixed addresses to email as well: verified members of your organization, or addresses on your verified domains (live environments).
    /// </summary>
    [Optional]
    [JsonPropertyName("email_to")]
    public IEnumerable<string>? EmailTo { get; set; }

    /// <summary>
    /// Your own subject, with `{{variables}}`. Needs `email_from`.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("subject")]
    public Optional<string?> Subject { get; set; }

    /// <summary>
    /// Your own words in place of the standard first line, with `{{variables}}` and no links. The booking's details stay below it. Needs `email_from`.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("message")]
    public Optional<string?> Message { get; set; }

    /// <summary>
    /// Your own text, with `{{variables}}` other than names, and no links. `Reply STOP to opt out.` is always added.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("sms_message")]
    public Optional<string?> SmsMessage { get; set; }

    /// <summary>
    /// One button in the email. Needs `email_from`.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("button")]
    public Optional<SchedulingReminderInputButton?> Button { get; set; }

    /// <summary>
    /// Attach the calendar invitation to the emails.
    /// </summary>
    [Optional]
    [JsonPropertyName("include_invite")]
    public bool? IncludeInvite { get; set; }

    /// <summary>
    /// If it was booked after this reminder's moment, send it right away instead of skipping it, as long as the meeting is still ahead. Only for `before_minutes` on `start`.
    /// </summary>
    [Optional]
    [JsonPropertyName("send_if_late")]
    public bool? SendIfLate { get; set; }

    /// <summary>
    /// Don't send it once the booking is marked a no-show. Default: true on `end`.
    /// </summary>
    [Optional]
    [JsonPropertyName("skip_no_show")]
    public bool? SkipNoShow { get; set; }

    /// <summary>
    /// Only for bookings matching all of this, checked when it's due.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("only_if")]
    public Optional<SchedulingReminderInputOnlyIf?> OnlyIf { get; set; }

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
