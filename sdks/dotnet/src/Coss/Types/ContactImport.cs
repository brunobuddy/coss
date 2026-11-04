using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record ContactImport : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required ContactImportObject Object { get; set; }

    /// <summary>
    /// Contacts created.
    /// </summary>
    [JsonPropertyName("created")]
    public required long Created { get; set; }

    /// <summary>
    /// Existing contacts updated.
    /// </summary>
    [JsonPropertyName("updated")]
    public required long Updated { get; set; }

    /// <summary>
    /// Existing contacts the import marked `subscribed` that stay `unsubscribed`: an import never re-subscribes anyone.
    /// </summary>
    [JsonPropertyName("kept_unsubscribed")]
    public required long KeptUnsubscribed { get; set; }

    /// <summary>
    /// Entries that were refused. The rest of the import still went through.
    /// </summary>
    [JsonPropertyName("invalid")]
    public IEnumerable<ContactImportInvalidItem> Invalid { get; set; } =
        new List<ContactImportInvalidItem>();

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
