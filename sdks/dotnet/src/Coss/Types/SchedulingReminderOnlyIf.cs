using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Only for bookings matching all of this. `null`: every booking.
/// </summary>
[Serializable]
public record SchedulingReminderOnlyIf : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The booking's metadata must have all of these. `null`: any.
    /// </summary>
    [Nullable]
    [JsonPropertyName("metadata")]
    public Dictionary<string, string?>? Metadata { get; set; }

    /// <summary>
    /// The booking's location must be one of these. `null`: any.
    /// </summary>
    [Nullable]
    [JsonPropertyName("location_types")]
    public IEnumerable<string>? LocationTypes { get; set; }

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
