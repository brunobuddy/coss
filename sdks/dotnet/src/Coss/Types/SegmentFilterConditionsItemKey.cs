using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

[Serializable]
public record SegmentFilterConditionsItemKey : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("field")]
    public required SegmentFilterConditionsItemKeyField Field { get; set; }

    /// <summary>
    /// The custom property to test.
    /// </summary>
    [JsonPropertyName("key")]
    public required string Key { get; set; }

    /// <summary>
    /// How to compare: `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `contains`, `starts_with`, or `exists` and `not_exists`, which take no value.
    /// </summary>
    [JsonPropertyName("op")]
    public required SegmentFilterConditionsItemKeyOp Op { get; set; }

    /// <summary>
    /// A list for `in`/`not_in`; none for `exists`/`not_exists`.
    /// </summary>
    [Optional]
    [JsonPropertyName("value")]
    public OneOf<
        string,
        double,
        bool,
        IEnumerable<OneOf<string, double, bool>>
    >? Value { get; set; }

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
