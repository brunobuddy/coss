using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record SetSimulatedBusyRequest
{
    /// <summary>
    /// The host's id or uid.
    /// </summary>
    [JsonIgnore]
    public required string Host { get; set; }

    /// <summary>
    /// The simulated calendar's busy times.
    /// </summary>
    [JsonPropertyName("intervals")]
    public IEnumerable<SetSimulatedBusyRequestIntervalsItem> Intervals { get; set; } =
        new List<SetSimulatedBusyRequestIntervalsItem>();

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
