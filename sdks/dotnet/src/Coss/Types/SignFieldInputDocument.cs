using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SignFieldInputDocument : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// `signature` and `initials` take the signer's adopted signature, `date_signed` is filled with the signing date, `name` and `email` with the signer's, `text` and `checkbox` by the signer.
    /// </summary>
    [JsonPropertyName("type")]
    public required SignFieldInputDocumentType Type { get; set; }

    /// <summary>
    /// Default `true`. A signer can't finish with a required field empty.
    /// </summary>
    [Optional]
    [JsonPropertyName("required")]
    public bool? Required { get; set; }

    /// <summary>
    /// Shown to the signer.
    /// </summary>
    [Optional]
    [JsonPropertyName("label")]
    public string? Label { get; set; }

    /// <summary>
    /// Index of the document in `documents` (default 0).
    /// </summary>
    [Optional]
    [JsonPropertyName("document")]
    public long? Document { get; set; }

    /// <summary>
    /// 1-based page number.
    /// </summary>
    [JsonPropertyName("page")]
    public required long Page { get; set; }

    /// <summary>
    /// Left edge, in PDF points from the page's left.
    /// </summary>
    [JsonPropertyName("x")]
    public required double X { get; set; }

    /// <summary>
    /// Top edge, in PDF points from the page's top.
    /// </summary>
    [JsonPropertyName("y")]
    public required double Y { get; set; }

    /// <summary>
    /// In PDF points.
    /// </summary>
    [JsonPropertyName("width")]
    public required double Width { get; set; }

    /// <summary>
    /// In PDF points.
    /// </summary>
    [JsonPropertyName("height")]
    public required double Height { get; set; }

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
