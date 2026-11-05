using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingSlotExplanation : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingSlotExplanationObject Object { get; set; }

    /// <summary>
    /// The start asked about.
    /// </summary>
    [JsonPropertyName("start")]
    public required string Start { get; set; }

    /// <summary>
    /// When it would end.
    /// </summary>
    [JsonPropertyName("end")]
    public required string End { get; set; }

    /// <summary>
    /// Whether it can be booked right now.
    /// </summary>
    [JsonPropertyName("available")]
    public required bool Available { get; set; }

    /// <summary>
    /// Why it can't: `not_on_grid`, `too_soon`, `outside_booking_window`, `calendar_unverified`, `outside_availability`, `host_busy`, `already_claimed`, `limit_reached` or `session_full`, or `event_type_inactive` or `no_hosts`. `null` when it can. With several hosts refused, the first one's reason: see `hosts`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    /// <summary>
    /// Everyone who could take this event type, narrowed by the query.
    /// </summary>
    [JsonPropertyName("hosts")]
    public IEnumerable<SchedulingSlotExplanationHostsItem> Hosts { get; set; } =
        new List<SchedulingSlotExplanationHostsItem>();

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
