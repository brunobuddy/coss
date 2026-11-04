using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record CancelSeriesRequest
{
    /// <summary>
    /// The series' id.
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    /// <summary>
    /// Cancel this occurrence and those after it. Default: all of them.
    /// </summary>
    [Optional]
    [JsonPropertyName("from_index")]
    public long? FromIndex { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
