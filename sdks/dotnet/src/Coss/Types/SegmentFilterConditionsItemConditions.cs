using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SegmentFilterConditionsItemConditions : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// `all`: every condition must hold; `any`: one is enough.
    /// </summary>
    [JsonPropertyName("match")]
    public required SegmentFilterConditionsItemConditionsMatch Match { get; set; }

    /// <summary>
    /// The group's conditions.
    /// </summary>
    [JsonPropertyName("conditions")]
    public IEnumerable<SegmentFilterConditionsItemConditionsConditionsItem> Conditions { get; set; } =
        new List<SegmentFilterConditionsItemConditionsConditionsItem>();

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
