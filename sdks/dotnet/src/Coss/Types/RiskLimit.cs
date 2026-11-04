using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record RiskLimit : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required RiskLimitObject Object { get; set; }

    /// <summary>
    /// The bucket's name.
    /// </summary>
    [JsonPropertyName("bucket")]
    public required string Bucket { get; set; }

    /// <summary>
    /// Whether to let the request through. Denied requests take no tokens.
    /// </summary>
    [JsonPropertyName("allowed")]
    public required bool Allowed { get; set; }

    /// <summary>
    /// The bucket's size (`burst`).
    /// </summary>
    [JsonPropertyName("limit")]
    public required long Limit { get; set; }

    /// <summary>
    /// Tokens left for this key.
    /// </summary>
    [JsonPropertyName("remaining")]
    public required long Remaining { get; set; }

    /// <summary>
    /// Milliseconds until the key's bucket is full again.
    /// </summary>
    [JsonPropertyName("reset_ms")]
    public required long ResetMs { get; set; }

    /// <summary>
    /// When denied: milliseconds until the same request would be allowed; `null` when it never would (`cost` above the bucket's size). 0 when allowed.
    /// </summary>
    [Nullable]
    [JsonPropertyName("retry_after_ms")]
    public long? RetryAfterMs { get; set; }

    /// <summary>
    /// coss.com couldn't count (its store was unavailable): `allowed` is the bucket's `on_failure`.
    /// </summary>
    [JsonPropertyName("degraded")]
    public required bool Degraded { get; set; }

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
