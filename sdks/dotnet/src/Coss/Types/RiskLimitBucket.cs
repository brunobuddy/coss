using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record RiskLimitBucket : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required RiskLimitBucketObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// What `POST /v1/risk/limits` names it by.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Tokens added per `period_seconds`.
    /// </summary>
    [JsonPropertyName("limit")]
    public required long Limit { get; set; }

    /// <summary>
    /// How many seconds `limit` tokens take to be added.
    /// </summary>
    [JsonPropertyName("period_seconds")]
    public required long PeriodSeconds { get; set; }

    /// <summary>
    /// The bucket's size: how many requests a key can make at once.
    /// </summary>
    [JsonPropertyName("burst")]
    public required long Burst { get; set; }

    /// <summary>
    /// The answer while coss.com can't count (its store is unavailable): `allow` (fail open) or `deny`.
    /// </summary>
    [JsonPropertyName("on_failure")]
    public required RiskLimitBucketOnFailure OnFailure { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required DateTime UpdatedAt { get; set; }

    [JsonIgnore]
    public ReadOnlyAdditionalProperties AdditionalProperties { get; private set; } = new();

    void IJsonOnDeserialized.OnDeserialized() =>
        AdditionalProperties.CopyFromExtensionData(_extensionData);

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
