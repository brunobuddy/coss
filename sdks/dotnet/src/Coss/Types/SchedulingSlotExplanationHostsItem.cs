using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingSlotExplanationHostsItem : IJsonOnDeserialized
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
    /// `required` hosts must all be free. Only one `member` needs to be.
    /// </summary>
    [JsonPropertyName("role")]
    public required SchedulingSlotExplanationHostsItemRole Role { get; set; }

    /// <summary>
    /// Whether this host could take it.
    /// </summary>
    [JsonPropertyName("available")]
    public required bool Available { get; set; }

    /// <summary>
    /// Why not: `not_on_grid`, `too_soon`, `outside_booking_window`, `calendar_unverified`, `outside_availability`, `host_busy`, `already_claimed`, `limit_reached` or `session_full`. `null` when they could.
    /// </summary>
    [Nullable]
    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    /// <summary>
    /// With `calendar_unverified`: `calendar_needs_reauth`, `calendar_stale` or `calendar_not_covered`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("calendar_reason")]
    public string? CalendarReason { get; set; }

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
