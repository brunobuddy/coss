using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record CreateSeriesBody
{
    /// <summary>
    /// Makes retries safe: a repeated request with the same key and body returns the original booking instead of creating another, for 24 hours. A refused request keeps no key. 1-256 characters.
    /// </summary>
    [JsonIgnore]
    public string? IdempotencyKey { get; set; }

    [JsonIgnore]
    public required CreateSeriesRequest Body { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
