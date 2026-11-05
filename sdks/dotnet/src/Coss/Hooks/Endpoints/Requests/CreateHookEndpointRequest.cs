using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Hooks;

[Serializable]
public record CreateHookEndpointRequest
{
    /// <summary>
    /// The application's `id` (`happ_…`) or your `uid` for it.
    /// </summary>
    [JsonIgnore]
    public required string Application { get; set; }

    [JsonPropertyName("url")]
    public required string Url { get; set; }

    /// <summary>
    /// Your note about it.
    /// </summary>
    [Optional]
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    /// <summary>
    /// Event types delivered to this endpoint (existing, unarchived ones). An empty array means every type, including ones added later.
    /// </summary>
    [Optional]
    [JsonPropertyName("filter_types")]
    public IEnumerable<string>? FilterTypes { get; set; }

    /// <summary>
    /// A `whsec_` + base64 secret of 24-64 bytes to sign with, e.g. when migrating from another provider. Generated when omitted.
    /// </summary>
    [Optional]
    [JsonPropertyName("secret")]
    public string? Secret { get; set; }

    /// <summary>
    /// At most this many requests per second to this endpoint.
    /// </summary>
    [Optional]
    [JsonPropertyName("rate_limit_per_second")]
    public int? RateLimitPerSecond { get; set; }

    /// <summary>
    /// Your own key-value pairs (at most 16; keys up to 40 characters, values up to 500).
    /// </summary>
    [Optional]
    [JsonPropertyName("metadata")]
    public Dictionary<string, string>? Metadata { get; set; }

    /// <summary>
    /// Default `true`. `false` creates it disabled, with `disabled_reason: manual`.
    /// </summary>
    [Optional]
    [JsonPropertyName("enabled")]
    public bool? Enabled { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
