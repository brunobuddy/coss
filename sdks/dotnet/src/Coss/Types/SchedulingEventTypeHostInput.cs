using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingEventTypeHostInput : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The host's id or uid.
    /// </summary>
    [JsonPropertyName("host")]
    public required string Host { get; set; }

    /// <summary>
    /// `required` hosts must all be free; one `member` is chosen for a booking.
    /// </summary>
    [Optional]
    [JsonPropertyName("role")]
    public SchedulingEventTypeHostInputRole? Role { get; set; }

    /// <summary>
    /// Share of a pool's bookings relative to other members.
    /// </summary>
    [Optional]
    [JsonPropertyName("weight")]
    public int? Weight { get; set; }

    /// <summary>
    /// A schedule of this host's. Default: their default schedule.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("schedule")]
    public Optional<string?> Schedule { get; set; }

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
