using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record ContactTopics : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required ContactTopicsObject Object { get; set; }

    /// <summary>
    /// The contact's id.
    /// </summary>
    [JsonPropertyName("contact_id")]
    public required string ContactId { get; set; }

    /// <summary>
    /// Every topic of the environment, with this contact's standing.
    /// </summary>
    [JsonPropertyName("topics")]
    public IEnumerable<ContactTopicsTopicsItem> Topics { get; set; } =
        new List<ContactTopicsTopicsItem>();

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
