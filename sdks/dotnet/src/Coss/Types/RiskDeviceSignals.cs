using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// What the browser reported through `coss/device` (its device id is only kept as a keyed hash).
/// </summary>
[Serializable]
public record RiskDeviceSignals : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// `false`: the token was malformed or too old.
    /// </summary>
    [JsonPropertyName("valid")]
    public required bool Valid { get; set; }

    /// <summary>
    /// WebDriver control or a headless browser.
    /// </summary>
    [JsonPropertyName("automation")]
    public required bool Automation { get; set; }

    /// <summary>
    /// IANA time zone (`Europe/London`).
    /// </summary>
    [Nullable]
    [JsonPropertyName("timezone")]
    public string? Timezone { get; set; }

    /// <summary>
    /// The browser's first language.
    /// </summary>
    [Nullable]
    [JsonPropertyName("language")]
    public string? Language { get; set; }

    /// <summary>
    /// The browser's reported platform. `null` when it reported none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("platform")]
    public string? Platform { get; set; }

    /// <summary>
    /// `&lt;width&gt;x&lt;height&gt;` in CSS pixels.
    /// </summary>
    [Nullable]
    [JsonPropertyName("screen")]
    public string? Screen { get; set; }

    /// <summary>
    /// Whether the device has a touch screen. `null` when it didn't say.
    /// </summary>
    [Nullable]
    [JsonPropertyName("touch")]
    public bool? Touch { get; set; }

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
