using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Risk;

[Serializable]
public record UpdateRiskLimitBucketRequest
{
    /// <summary>
    /// The bucket's id.
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    /// <summary>
    /// Tokens added per `period_seconds`.
    /// </summary>
    [Optional]
    [JsonPropertyName("limit")]
    public int? Limit { get; set; }

    /// <summary>
    /// How many seconds `limit` tokens take to be added.
    /// </summary>
    [Optional]
    [JsonPropertyName("period_seconds")]
    public int? PeriodSeconds { get; set; }

    /// <summary>
    /// The bucket's size: how many requests a key can make at once.
    /// </summary>
    [Optional]
    [JsonPropertyName("burst")]
    public int? Burst { get; set; }

    /// <summary>
    /// The answer while coss.com can't count: `allow` or `deny`.
    /// </summary>
    [Optional]
    [JsonPropertyName("on_failure")]
    public UpdateRiskLimitBucketRequestOnFailure? OnFailure { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
