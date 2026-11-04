using Coss;
using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Email;

[Serializable]
public record UpdateContactTopicsRequestTopicsItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The topic's key.
    /// </summary>
    [JsonPropertyName("topic")]
    public required string Topic { get; set; }

    /// <summary>
    /// `opted_in` or `opted_out` of the topic.
    /// </summary>
    [JsonPropertyName("status")]
    public required UpdateContactTopicsRequestTopicsItemStatus Status { get; set; }

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
