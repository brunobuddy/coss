using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingAvailabilitySearchResult : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingAvailabilitySearchResultObject Object { get; set; }

    /// <summary>
    /// Each host with availability, soonest first.
    /// </summary>
    [JsonPropertyName("data")]
    public IEnumerable<SchedulingAvailabilitySearchResultDataItem> Data { get; set; } =
        new List<SchedulingAvailabilitySearchResultDataItem>();

    /// <summary>
    /// Whether more hosts matched than `limit` returned.
    /// </summary>
    [JsonPropertyName("has_more")]
    public required bool HasMore { get; set; }

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
