using Coss;
using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Risk;

[Serializable]
public record UpdateRiskSettingsRequestCaptcha : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The captcha provider.
    /// </summary>
    [JsonPropertyName("provider")]
    public required UpdateRiskSettingsRequestCaptchaProvider Provider { get; set; }

    /// <summary>
    /// The provider's secret key. Required when setting a provider for the first time or changing it; stored encrypted and never returned.
    /// </summary>
    [Optional]
    [JsonPropertyName("secret")]
    public string? Secret { get; set; }

    /// <summary>
    /// Assessments without a `captcha` token get `captcha.missing`. Default false.
    /// </summary>
    [Optional]
    [JsonPropertyName("required")]
    public bool? Required { get; set; }

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
