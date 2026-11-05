using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingSlot : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// When the slot starts.
    /// </summary>
    [JsonPropertyName("start")]
    public required string Start { get; set; }

    /// <summary>
    /// When the slot ends.
    /// </summary>
    [JsonPropertyName("end")]
    public required string End { get; set; }

    /// <summary>
    /// Who could take it.
    /// </summary>
    [JsonPropertyName("hosts")]
    public IEnumerable<string> Hosts { get; set; } = new List<string>();

    /// <summary>
    /// Free seats at this start, for a `group` event type. `null` for the others.
    /// </summary>
    [Nullable]
    [JsonPropertyName("seats_left")]
    public double? SeatsLeft { get; set; }

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
