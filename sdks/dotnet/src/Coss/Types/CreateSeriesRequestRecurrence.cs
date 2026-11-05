using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// How often the booking repeats, at the attendee's local time.
/// </summary>
[Serializable]
public record CreateSeriesRequestRecurrence : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Repeat weekly or monthly.
    /// </summary>
    [JsonPropertyName("frequency")]
    public required CreateSeriesRequestRecurrenceFrequency Frequency { get; set; }

    /// <summary>
    /// Every this many weeks or months. Default: 1.
    /// </summary>
    [Optional]
    [JsonPropertyName("interval")]
    public int? Interval { get; set; }

    /// <summary>
    /// Occurrences in total, the first included.
    /// </summary>
    [JsonPropertyName("count")]
    public required int Count { get; set; }

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
