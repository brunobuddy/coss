using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingAvailabilitySearchResultDataItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The host's id.
    /// </summary>
    [JsonPropertyName("host")]
    public required string Host { get; set; }

    /// <summary>
    /// The host's own uid. `null` when none is set.
    /// </summary>
    [Nullable]
    [JsonPropertyName("uid")]
    public string? Uid { get; set; }

    /// <summary>
    /// The host's soonest slots.
    /// </summary>
    [JsonPropertyName("slots")]
    public IEnumerable<SchedulingAvailabilitySearchResultDataItemSlotsItem> Slots { get; set; } =
        new List<SchedulingAvailabilitySearchResultDataItemSlotsItem>();

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
