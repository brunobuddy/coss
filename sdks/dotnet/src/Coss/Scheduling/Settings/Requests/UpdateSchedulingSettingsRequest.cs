using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record UpdateSchedulingSettingsRequest
{
    /// <summary>
    /// Sites allowed to embed coss.com's hosted pages and call the client API, as `https://host` origins.
    /// </summary>
    [Optional]
    [JsonPropertyName("allowed_origins")]
    public IEnumerable<string>? AllowedOrigins { get; set; }

    /// <summary>
    /// Your name on hosted pages and on emails sent from `email_from`. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("brand_name")]
    public Optional<string?> BrandName { get; set; }

    /// <summary>
    /// The accent color as `#RRGGBB`. `null` restores the default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("accent_color")]
    public Optional<string?> AccentColor { get; set; }

    /// <summary>
    /// Your logo, a PNG or JPEG. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("logo")]
    public Optional<UpdateSchedulingSettingsRequestLogo?> Logo { get; set; }

    /// <summary>
    /// Sender of booking emails, on a verified domain. `null`: coss.com's own address.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("email_from")]
    public Optional<string?> EmailFrom { get; set; }

    /// <summary>
    /// Your approved number for SMS reminders, in E.164. `null`: no SMS is sent.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("sms_from")]
    public Optional<string?> SmsFrom { get; set; }

    /// <summary>
    /// When a host's calendar can't be read: `hide` stops offering them, `last_known` keeps offering their last known times.
    /// </summary>
    [Optional]
    [JsonPropertyName("calendar_failure_mode")]
    public UpdateSchedulingSettingsRequestCalendarFailureMode? CalendarFailureMode { get; set; }

    /// <summary>
    /// Per event (`confirmed`, `pending_approval`, `rescheduled`, `cancelled`, `declined`, `reminder`), overriding the defaults. `null` restores them.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("notifications")]
    public Optional<Dictionary<
        string,
        UpdateSchedulingSettingsRequestNotificationsValue?
    >?> Notifications { get; set; }

    /// <summary>
    /// Where replies go, for emails from `email_from`.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("email_reply_to")]
    public Optional<string?> EmailReplyTo { get; set; }

    /// <summary>
    /// What goes out around a booking, unless an event type has its own. `null` goes back to a reminder a day before.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("reminders")]
    public Optional<IEnumerable<SchedulingReminderInput>?> Reminders { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
