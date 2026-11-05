using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// File uploads.
/// </summary>
[Serializable]
public record FormFiles : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Whether uploads are accepted (`multipart/form-data`).
    /// </summary>
    [JsonPropertyName("enabled")]
    public required bool Enabled { get; set; }

    /// <summary>
    /// Most files per submission.
    /// </summary>
    [JsonPropertyName("max_files")]
    public required long MaxFiles { get; set; }

    /// <summary>
    /// Largest file, in bytes.
    /// </summary>
    [JsonPropertyName("max_file_bytes")]
    public required long MaxFileBytes { get; set; }

    /// <summary>
    /// MIME types accepted. Empty: images, PDFs, text and Office.
    /// </summary>
    [JsonPropertyName("allowed_types")]
    public IEnumerable<string> AllowedTypes { get; set; } = new List<string>();

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
