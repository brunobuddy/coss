using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record EraseSchedulingAttendeeByEmailRequest
{
    /// <summary>
    /// The address to forget, an attendee's or a guest's.
    /// </summary>
    [JsonPropertyName("email")]
    public required string Email { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
