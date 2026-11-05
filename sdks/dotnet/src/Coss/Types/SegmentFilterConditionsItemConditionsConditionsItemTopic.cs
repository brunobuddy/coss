using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SegmentFilterConditionsItemConditionsConditionsItemTopic : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Whether emails about the topic reach the contact.
    /// </summary>
    [JsonPropertyName("op")]
    public required SegmentFilterConditionsItemConditionsConditionsItemTopicOp Op { get; set; }

    /// <summary>
    /// The topic's key.
    /// </summary>
    [JsonPropertyName("topic")]
    public required string Topic { get; set; }

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
