using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record NotificationsBookingsRequest
{
    /// <summary>
    /// The booking's id.
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    [JsonIgnore]
    public int? Limit { get; set; }

    /// <summary>
    /// The last id of the previous page.
    /// </summary>
    [JsonIgnore]
    public string? After { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
