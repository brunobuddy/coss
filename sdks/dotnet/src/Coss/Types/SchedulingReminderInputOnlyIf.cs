using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Only for bookings matching all of this, checked when it's due.
/// </summary>
[Serializable]
public record SchedulingReminderInputOnlyIf : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The booking's metadata must have all of these.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("metadata")]
    public Optional<Dictionary<string, string?>?> Metadata { get; set; }

    /// <summary>
    /// The booking's location must be one of these.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("location_types")]
    public Optional<IEnumerable<SchedulingReminderInputOnlyIfLocationTypesItem>?> LocationTypes { get; set; }

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
