using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record ListBookingsRequest
{
    [JsonIgnore]
    public int? Limit { get; set; }

    /// <summary>
    /// The last id of the previous page.
    /// </summary>
    [JsonIgnore]
    public string? After { get; set; }

    [JsonIgnore]
    public string? Host { get; set; }

    [JsonIgnore]
    public string? EventType { get; set; }

    [JsonIgnore]
    public ListBookingsRequestStatus? Status { get; set; }

    [JsonIgnore]
    public string? AttendeeUid { get; set; }

    /// <summary>
    /// An ISO 8601 instant with an offset.
    /// </summary>
    [JsonIgnore]
    public string? StartAfter { get; set; }

    /// <summary>
    /// An ISO 8601 instant with an offset.
    /// </summary>
    [JsonIgnore]
    public string? StartBefore { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
