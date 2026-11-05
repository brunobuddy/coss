using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SubaccountStats : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SubaccountStatsObject Object { get; set; }

    /// <summary>
    /// The sub-account's id.
    /// </summary>
    [JsonPropertyName("subaccount_id")]
    public required string SubaccountId { get; set; }

    /// <summary>
    /// The first date included.
    /// </summary>
    [JsonPropertyName("from")]
    public required DateOnly From { get; set; }

    /// <summary>
    /// The last date included.
    /// </summary>
    [JsonPropertyName("to")]
    public required DateOnly To { get; set; }

    /// <summary>
    /// One entry per day with sends, oldest first; recipients count by their current status.
    /// </summary>
    [JsonPropertyName("data")]
    public IEnumerable<SubaccountStatsDay> Data { get; set; } = new List<SubaccountStatsDay>();

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
