using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

[Serializable]
public record SegmentFilterConditionsItemConditionsConditionsItemCreatedAt : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// `before` or `after` a time, or created `within_days` the last days.
    /// </summary>
    [JsonPropertyName("op")]
    public required SegmentFilterConditionsItemConditionsConditionsItemCreatedAtOp Op { get; set; }

    /// <summary>
    /// A timestamp for `before`/`after`, a number of days for `within_days`.
    /// </summary>
    [JsonPropertyName("value")]
    public required OneOf<DateTime, int> Value { get; set; }

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
