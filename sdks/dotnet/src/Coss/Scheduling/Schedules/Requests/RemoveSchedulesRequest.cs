using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record RemoveSchedulesRequest
{
    /// <summary>
    /// The host's id or uid.
    /// </summary>
    [JsonIgnore]
    public required string Host { get; set; }

    /// <summary>
    /// The schedule's id.
    /// </summary>
    [JsonIgnore]
    public required string ScheduleId { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
