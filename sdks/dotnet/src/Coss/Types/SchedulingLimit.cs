using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// A cap on bookings in a day or a week.
/// </summary>
[Serializable]
public record SchedulingLimit : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// In the host's time zone.
    /// </summary>
    [JsonPropertyName("period")]
    public required SchedulingLimitPeriod Period { get; set; }

    /// <summary>
    /// The most bookings allowed in one period.
    /// </summary>
    [JsonPropertyName("max")]
    public required int Max { get; set; }

    /// <summary>
    /// Count this event type's bookings, or all of the host's.
    /// </summary>
    [Optional]
    [JsonPropertyName("scope")]
    public SchedulingLimitScope? Scope { get; set; }

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
