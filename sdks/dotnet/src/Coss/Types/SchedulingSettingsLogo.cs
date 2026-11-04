using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// At the top of the hosted pages, and of emails sent from `email_from`.
/// </summary>
[Serializable]
public record SchedulingSettingsLogo : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The image's type, checked from its bytes.
    /// </summary>
    [JsonPropertyName("content_type")]
    public required SchedulingSettingsLogoContentType ContentType { get; set; }

    /// <summary>
    /// Width in pixels.
    /// </summary>
    [JsonPropertyName("width")]
    public required long Width { get; set; }

    /// <summary>
    /// Height in pixels.
    /// </summary>
    [JsonPropertyName("height")]
    public required long Height { get; set; }

    /// <summary>
    /// The image, as a `data:` URL.
    /// </summary>
    [JsonPropertyName("data_url")]
    public required string DataUrl { get; set; }

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
