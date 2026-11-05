using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Its own sending standing.
/// </summary>
[Serializable]
public record SubaccountReputation : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// `warning`: a rate is close to its limit. `paused`: its live sends are refused (`subaccount_paused`) until you reinstate it.
    /// </summary>
    [JsonPropertyName("status")]
    public required SubaccountReputationStatus Status { get; set; }

    /// <summary>
    /// What last changed it, e.g. `bounce_rate`, `complaint_rate`, `content_screening`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("trigger")]
    public string? Trigger { get; set; }

    /// <summary>
    /// When its status last changed. `null`: never.
    /// </summary>
    [Nullable]
    [JsonPropertyName("changed_at")]
    public DateTime? ChangedAt { get; set; }

    /// <summary>
    /// When it was last reinstated. `null`: never.
    /// </summary>
    [Nullable]
    [JsonPropertyName("reinstated_at")]
    public DateTime? ReinstatedAt { get; set; }

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
