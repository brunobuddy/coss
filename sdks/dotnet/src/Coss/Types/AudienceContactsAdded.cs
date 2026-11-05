using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record AudienceContactsAdded : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required AudienceContactsAddedObject Object { get; set; }

    /// <summary>
    /// Contacts newly added.
    /// </summary>
    [JsonPropertyName("added")]
    public required long Added { get; set; }

    /// <summary>
    /// Contacts that were already members.
    /// </summary>
    [JsonPropertyName("existing")]
    public required long Existing { get; set; }

    /// <summary>
    /// Ids or addresses of no contact.
    /// </summary>
    [JsonPropertyName("missing")]
    public IEnumerable<string> Missing { get; set; } = new List<string>();

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
