using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Sign;

[Serializable]
public record UpdateSignSettingsRequest
{
    /// <summary>
    /// Origins that may embed the signing page in an iframe, like `https://app.example.com` (sandbox environments also `http://localhost:&lt;port&gt;`). Empty: it can only be opened on its own.
    /// </summary>
    [Optional]
    [JsonPropertyName("allowed_origins")]
    public IEnumerable<string>? AllowedOrigins { get; set; }

    /// <summary>
    /// The requester's name signers see. `null`: the organization's name.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("display_name")]
    public Optional<string?> DisplayName { get; set; }

    /// <summary>
    /// The signing page's accent color, as `#RRGGBB`. `null`: the default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("accent_color")]
    public Optional<string?> AccentColor { get; set; }

    /// <summary>
    /// The signing page's theme. `system` follows the signer's device.
    /// </summary>
    [Optional]
    [JsonPropertyName("theme")]
    public UpdateSignSettingsRequestTheme? Theme { get; set; }

    /// <summary>
    /// Your own consent text signers accept before they see a document. `null`: coss.com's default. Have your counsel review a replacement.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("disclosure")]
    public Optional<string?> Disclosure { get; set; }

    /// <summary>
    /// Signing emails come from this address, on a verified domain in live environments. `null`: from coss.com, as "&lt;display name&gt; via coss.com".
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("email_from")]
    public Optional<string?> EmailFrom { get; set; }

    /// <summary>
    /// The default days between reminders for new requests. `null`: none.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("reminder_interval_days")]
    public Optional<int?> ReminderIntervalDays { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
