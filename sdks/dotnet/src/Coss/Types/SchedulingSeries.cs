using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingSeries : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingSeriesObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The occurrences booked, each an ordinary booking.
    /// </summary>
    [JsonPropertyName("bookings")]
    public IEnumerable<SchedulingBooking> Bookings { get; set; } = new List<SchedulingBooking>();

    /// <summary>
    /// With `on_conflict: skip`, the occurrences that weren't free and weren't booked.
    /// </summary>
    [JsonPropertyName("conflicts")]
    public IEnumerable<SchedulingSeriesConflictsItem> Conflicts { get; set; } =
        new List<SchedulingSeriesConflictsItem>();

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
