using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingEventTypeHostsItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The host's id.
    /// </summary>
    [JsonPropertyName("host")]
    public required string Host { get; set; }

    /// <summary>
    /// `required` hosts must all be free; one `member` is chosen for a booking.
    /// </summary>
    [JsonPropertyName("role")]
    public required SchedulingEventTypeHostsItemRole Role { get; set; }

    /// <summary>
    /// Share of a pool's bookings relative to other members.
    /// </summary>
    [JsonPropertyName("weight")]
    public required double Weight { get; set; }

    /// <summary>
    /// The id of the schedule used for this event type. `null`: the host's default schedule.
    /// </summary>
    [Nullable]
    [JsonPropertyName("schedule")]
    public string? Schedule { get; set; }

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
