using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record VerifyCalendarDelegationRequest
{
    /// <summary>
    /// The delegation's id.
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    /// <summary>
    /// A real mailbox on the domain to try. In Microsoft 365, a user principal name.
    /// </summary>
    [JsonPropertyName("account")]
    public required string Account { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
