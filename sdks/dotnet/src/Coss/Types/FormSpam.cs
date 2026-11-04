using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// How submissions are screened.
/// </summary>
[Serializable]
public record FormSpam : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// A field people leave empty; a submission that fills it is spam.
    /// </summary>
    [JsonPropertyName("honeypot_field")]
    public required string HoneypotField { get; set; }

    /// <summary>
    /// `required`: submissions need a captcha token. `off`: they don't.
    /// </summary>
    [JsonPropertyName("captcha")]
    public required FormSpamCaptcha Captcha { get; set; }

    /// <summary>
    /// The captcha's site key, which hosted pages render the widget with. `null`: none set.
    /// </summary>
    [Nullable]
    [JsonPropertyName("captcha_site_key")]
    public string? CaptchaSiteKey { get; set; }

    /// <summary>
    /// A submission whose text scores at least this in a content category is spam. `null`: the environment's risk settings decide.
    /// </summary>
    [Nullable]
    [JsonPropertyName("content_threshold")]
    public double? ContentThreshold { get; set; }

    /// <summary>
    /// When Risk's decision is `review`: `hold` keeps the submission until you release it, `deliver` delivers it.
    /// </summary>
    [JsonPropertyName("on_review")]
    public required FormSpamOnReview OnReview { get; set; }

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
