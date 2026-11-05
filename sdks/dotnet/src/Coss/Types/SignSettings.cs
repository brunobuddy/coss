using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SignSettings : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SignSettingsObject Object { get; set; }

    /// <summary>
    /// Origins that may embed the signing page in an iframe, like `https://app.example.com` (sandbox environments also `http://localhost:&lt;port&gt;`). Empty: it can only be opened on its own.
    /// </summary>
    [JsonPropertyName("allowed_origins")]
    public IEnumerable<string> AllowedOrigins { get; set; } = new List<string>();

    /// <summary>
    /// The requester's name signers see. `null`: the organization's name.
    /// </summary>
    [Nullable]
    [JsonPropertyName("display_name")]
    public string? DisplayName { get; set; }

    /// <summary>
    /// The signing page's accent color, as `#RRGGBB`. `null`: the default.
    /// </summary>
    [Nullable]
    [JsonPropertyName("accent_color")]
    public string? AccentColor { get; set; }

    /// <summary>
    /// The signing page's theme. `system` follows the signer's device.
    /// </summary>
    [JsonPropertyName("theme")]
    public required SignSettingsTheme Theme { get; set; }

    /// <summary>
    /// Your own consent text signers accept before they see a document. `null`: coss.com's default, which covers ESIGN's consumer disclosure. Have your counsel review a replacement.
    /// </summary>
    [Nullable]
    [JsonPropertyName("disclosure")]
    public string? Disclosure { get; set; }

    /// <summary>
    /// Signing emails (invitations, reminders, signed copies) come from this address, on a verified domain in live environments. `null`: from coss.com, as "&lt;display name&gt; via coss.com".
    /// </summary>
    [Nullable]
    [JsonPropertyName("email_from")]
    public string? EmailFrom { get; set; }

    /// <summary>
    /// The default days between reminders for new requests; `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("reminder_interval_days")]
    public long? ReminderIntervalDays { get; set; }

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
