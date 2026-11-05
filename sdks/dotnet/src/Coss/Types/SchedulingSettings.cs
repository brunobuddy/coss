using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingSettings : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingSettingsObject Object { get; set; }

    /// <summary>
    /// Sites allowed to embed coss.com's hosted pages and call the client API.
    /// </summary>
    [JsonPropertyName("allowed_origins")]
    public IEnumerable<string> AllowedOrigins { get; set; } = new List<string>();

    /// <summary>
    /// Your name on hosted pages and on emails sent from `email_from`. `null`: none set.
    /// </summary>
    [Nullable]
    [JsonPropertyName("brand_name")]
    public string? BrandName { get; set; }

    /// <summary>
    /// The accent color of hosted pages and emails sent from `email_from`, as `#RRGGBB`. `null`: the default.
    /// </summary>
    [Nullable]
    [JsonPropertyName("accent_color")]
    public string? AccentColor { get; set; }

    /// <summary>
    /// At the top of the hosted pages, and of emails sent from `email_from`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("logo")]
    public SchedulingSettingsLogo? Logo { get; set; }

    /// <summary>
    /// Sender of booking emails, on a verified domain.
    /// </summary>
    [Nullable]
    [JsonPropertyName("email_from")]
    public string? EmailFrom { get; set; }

    /// <summary>
    /// Your approved number for SMS reminders. Without one, no SMS is sent.
    /// </summary>
    [Nullable]
    [JsonPropertyName("sms_from")]
    public string? SmsFrom { get; set; }

    /// <summary>
    /// When a host's calendar can't be read: `hide` stops offering them, `last_known` keeps offering their last known times.
    /// </summary>
    [JsonPropertyName("calendar_failure_mode")]
    public required SchedulingSettingsCalendarFailureMode CalendarFailureMode { get; set; }

    /// <summary>
    /// Per event, overriding the defaults.
    /// </summary>
    [Nullable]
    [JsonPropertyName("notifications")]
    public Dictionary<string, SchedulingSettingsNotificationsValue?>? Notifications { get; set; }

    [Nullable]
    [JsonPropertyName("email_reply_to")]
    public string? EmailReplyTo { get; set; }

    /// <summary>
    /// What goes out around a booking, unless an event type has its own. `null`: a reminder a day before, on the channels `notifications.reminder` chooses.
    /// </summary>
    [Nullable]
    [JsonPropertyName("reminders")]
    public IEnumerable<SchedulingReminder>? Reminders { get; set; }

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
