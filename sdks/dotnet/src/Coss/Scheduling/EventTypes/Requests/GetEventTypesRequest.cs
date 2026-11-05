using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record GetEventTypesRequest
{
    /// <summary>
    /// The event type's id or uid.
    /// </summary>
    [JsonIgnore]
    public required string EventType { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
