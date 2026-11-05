using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SegmentFilterConditionsItemConditionsConditionsItemAudience : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Whether the contact is in the audience.
    /// </summary>
    [JsonPropertyName("op")]
    public required SegmentFilterConditionsItemConditionsConditionsItemAudienceOp Op { get; set; }

    /// <summary>
    /// The audience's id.
    /// </summary>
    [JsonPropertyName("audience_id")]
    public required string AudienceId { get; set; }

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
