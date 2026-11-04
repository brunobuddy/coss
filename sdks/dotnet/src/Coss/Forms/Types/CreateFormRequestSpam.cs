using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// How submissions are screened. Only the fields given change.
/// </summary>
[Serializable]
public record CreateFormRequestSpam : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// A field people leave empty (hide it with CSS); a submission that fills it is spam. Default `_gotcha`.
    /// </summary>
    [Optional]
    [JsonPropertyName("honeypot_field")]
    public string? HoneypotField { get; set; }

    /// <summary>
    /// `required`: submissions need a token from the captcha set in the environment's risk settings (Turnstile or hCaptcha). Default `off`.
    /// </summary>
    [Optional]
    [JsonPropertyName("captcha")]
    public CreateFormRequestSpamCaptcha? Captcha { get; set; }

    /// <summary>
    /// The captcha's site key, which hosted pages render the widget with.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("captcha_site_key")]
    public Optional<string?> CaptchaSiteKey { get; set; }

    /// <summary>
    /// A submission whose text scores at least this in a content category (spam, phishing, malware, fraud) is spam. Default 0.9; `null` leaves content to the environment's risk settings.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("content_threshold")]
    public Optional<double?> ContentThreshold { get; set; }

    /// <summary>
    /// What happens when Risk's decision is `review`: `hold` (default) keeps the submission until you release it, `deliver` delivers it.
    /// </summary>
    [Optional]
    [JsonPropertyName("on_review")]
    public CreateFormRequestSpamOnReview? OnReview { get; set; }

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
