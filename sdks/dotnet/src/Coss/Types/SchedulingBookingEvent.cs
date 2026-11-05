using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingBookingEvent : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingBookingEventObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// This booking's events count up from 1.
    /// </summary>
    [JsonPropertyName("sequence")]
    public required double Sequence { get; set; }

    /// <summary>
    /// What happened, such as `scheduling.booking.confirmed`, `scheduling.booking.rescheduled` or `scheduling.booking.cancelled`.
    /// </summary>
    [JsonPropertyName("type")]
    public required string Type { get; set; }

    /// <summary>
    /// Who did it.
    /// </summary>
    [JsonPropertyName("actor")]
    public required SchedulingBookingEventActor Actor { get; set; }

    /// <summary>
    /// More about it, such as `previous_start` on a reschedule. Never personal data.
    /// </summary>
    [JsonPropertyName("details")]
    public Dictionary<string, object?> Details { get; set; } = new Dictionary<string, object?>();

    /// <summary>
    /// When it happened.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required string OccurredAt { get; set; }

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
