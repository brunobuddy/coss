using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// How the captcha went. `null` when no captcha applies.
/// </summary>
[Serializable]
public record RiskCaptchaSignals : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Whether the request carried a token.
    /// </summary>
    [JsonPropertyName("provided")]
    public required bool Provided { get; set; }

    /// <summary>
    /// `null` when it couldn't be checked (no captcha configured, or the provider was unreachable).
    /// </summary>
    [Nullable]
    [JsonPropertyName("passed")]
    public bool? Passed { get; set; }

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
