using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SignTemplateDocumentsItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The file's name.
    /// </summary>
    [JsonPropertyName("filename")]
    public required string Filename { get; set; }

    /// <summary>
    /// Hex SHA-256 of the uploaded bytes.
    /// </summary>
    [JsonPropertyName("sha256")]
    public required string Sha256 { get; set; }

    /// <summary>
    /// How many pages it has.
    /// </summary>
    [JsonPropertyName("page_count")]
    public required long PageCount { get; set; }

    /// <summary>
    /// Each page's size, in order.
    /// </summary>
    [JsonPropertyName("pages")]
    public IEnumerable<SignTemplateDocumentsItemPagesItem> Pages { get; set; } =
        new List<SignTemplateDocumentsItemPagesItem>();

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
