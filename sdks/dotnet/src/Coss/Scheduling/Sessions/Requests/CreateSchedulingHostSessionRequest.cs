using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record CreateSchedulingHostSessionRequest
{
    /// <summary>
    /// The host's id or uid.
    /// </summary>
    [JsonIgnore]
    public required string Host { get; set; }

    /// <summary>
    /// Seconds until it stops working. At most a day.
    /// </summary>
    [Optional]
    [JsonPropertyName("expires_in")]
    public int? ExpiresIn { get; set; }

    /// <summary>
    /// The host can look but not change anything.
    /// </summary>
    [Optional]
    [JsonPropertyName("read_only")]
    public bool? ReadOnly { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
