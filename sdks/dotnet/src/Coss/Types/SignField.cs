using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// A box on a page that one signer fills.
/// </summary>
[Serializable]
public record SignField : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SignFieldObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The id of the signer who fills it.
    /// </summary>
    [JsonPropertyName("signer_id")]
    public required string SignerId { get; set; }

    /// <summary>
    /// The id of the document it's on.
    /// </summary>
    [JsonPropertyName("document_id")]
    public required string DocumentId { get; set; }

    /// <summary>
    /// `signature` and `initials` take the signer's adopted signature, `date_signed` is filled with the signing date, `name` and `email` with the signer's, `text` and `checkbox` by the signer.
    /// </summary>
    [JsonPropertyName("type")]
    public required SignFieldType Type { get; set; }

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

    /// <summary>
    /// Whether a signer can finish with it empty.
    /// </summary>
    [JsonPropertyName("required")]
    public required bool Required { get; set; }

    /// <summary>
    /// Shown to the signer. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("label")]
    public string? Label { get; set; }

    /// <summary>
    /// The text anchor it was placed by. `null`: placed by position.
    /// </summary>
    [Nullable]
    [JsonPropertyName("anchor")]
    public string? Anchor { get; set; }

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
