using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record ConfirmHoldRequest
{
    /// <summary>
    /// The booking's id.
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    /// <summary>
    /// After the hold expired, book anyway if nobody else took the slot. Default: refuse with `hold_expired`.
    /// </summary>
    [Optional]
    [JsonPropertyName("if_still_free")]
    public bool? IfStillFree { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
