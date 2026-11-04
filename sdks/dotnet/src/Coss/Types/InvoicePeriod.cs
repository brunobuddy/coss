using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// What period it covers.
/// </summary>
[Serializable]
public record InvoicePeriod : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// When the period starts (inclusive).
    /// </summary>
    [JsonPropertyName("start")]
    public required DateTime Start { get; set; }

    /// <summary>
    /// When the period ends (exclusive).
    /// </summary>
    [JsonPropertyName("end")]
    public required DateTime End { get; set; }

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
