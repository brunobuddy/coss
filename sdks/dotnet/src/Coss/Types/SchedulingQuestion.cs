using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Something attendees are asked when booking. Answers are encrypted, and come back only when you retrieve one booking.
/// </summary>
[Serializable]
public record SchedulingQuestion : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The answer's key in `answers`. Unique within the event type.
    /// </summary>
    [JsonPropertyName("key")]
    public required string Key { get; set; }

    /// <summary>
    /// How it's asked and which answers are valid.
    /// </summary>
    [JsonPropertyName("type")]
    public required SchedulingQuestionType Type { get; set; }

    /// <summary>
    /// The question as attendees see it.
    /// </summary>
    [JsonPropertyName("label")]
    public required string Label { get; set; }

    /// <summary>
    /// Whether a booking must answer it.
    /// </summary>
    [Optional]
    [JsonPropertyName("required")]
    public bool? Required { get; set; }

    /// <summary>
    /// The choices of a `select`, `radio` or `checkbox` question. `select` and `radio` need at least one.
    /// </summary>
    [Optional]
    [JsonPropertyName("options")]
    public IEnumerable<string>? Options { get; set; }

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
