using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SignTemplateFieldsItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The `key` of the role that fills it.
    /// </summary>
    [JsonPropertyName("role")]
    public required string Role { get; set; }

    /// <summary>
    /// The id of the document it's on.
    /// </summary>
    [JsonPropertyName("document_id")]
    public required string DocumentId { get; set; }

    /// <summary>
    /// What the field takes, as on a signature request.
    /// </summary>
    [JsonPropertyName("type")]
    public required SignTemplateFieldsItemType Type { get; set; }

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
    /// `text` fields: which `merge_fields` value fills it. `null`: the signer fills it.
    /// </summary>
    [Nullable]
    [JsonPropertyName("merge_key")]
    public string? MergeKey { get; set; }

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
