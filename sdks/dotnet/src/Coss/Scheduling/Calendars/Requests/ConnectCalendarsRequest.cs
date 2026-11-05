using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record ConnectCalendarsRequest
{
    /// <summary>
    /// The host's id or uid.
    /// </summary>
    [JsonIgnore]
    public required string Host { get; set; }

    [JsonIgnore]
    public required CreateCalendarConnectionRequest Body { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
