using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record EraseAttendeesRequest
{
    /// <summary>
    /// Your id for the attendee.
    /// </summary>
    [JsonIgnore]
    public required string Uid { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
