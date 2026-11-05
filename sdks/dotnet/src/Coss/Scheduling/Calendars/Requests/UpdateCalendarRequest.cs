using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record UpdateCalendarRequest
{
    /// <summary>
    /// The host's id or uid.
    /// </summary>
    [JsonIgnore]
    public required string Host { get; set; }

    /// <summary>
    /// The calendar's id.
    /// </summary>
    [JsonIgnore]
    public required string CalendarId { get; set; }

    /// <summary>
    /// Whether this calendar's busy times block slots.
    /// </summary>
    [Optional]
    [JsonPropertyName("read_busy")]
    public bool? ReadBusy { get; set; }

    /// <summary>
    /// Bookings are written to one calendar; setting this moves it here.
    /// </summary>
    [Optional]
    [JsonPropertyName("write_target")]
    public bool? WriteTarget { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
