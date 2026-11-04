using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SignDocument : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SignDocumentObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The file's name, as uploaded.
    /// </summary>
    [JsonPropertyName("filename")]
    public required string Filename { get; set; }

    /// <summary>
    /// Bytes.
    /// </summary>
    [JsonPropertyName("size")]
    public required long Size { get; set; }

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
    public IEnumerable<SignDocumentPagesItem> Pages { get; set; } =
        new List<SignDocumentPagesItem>();

    /// <summary>
    /// Text anchors (`{{signature:signer_1}}`) found in the document, which fields can be placed by.
    /// </summary>
    [JsonPropertyName("anchors")]
    public IEnumerable<SignDocumentAnchorsItem> Anchors { get; set; } =
        new List<SignDocumentAnchorsItem>();

    /// <summary>
    /// Whether it belongs to a sandbox environment.
    /// </summary>
    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

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
