using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The DNS record to publish, with the result of the last check.
/// </summary>
[Serializable]
public record TrackingDomainRecord : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The record's type.
    /// </summary>
    [JsonPropertyName("type")]
    public required TrackingDomainRecordType Type { get; set; }

    /// <summary>
    /// The fully qualified record name to create.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// The host the record must point at.
    /// </summary>
    [JsonPropertyName("value")]
    public required string Value { get; set; }

    /// <summary>
    /// What the last DNS check saw. `not_checked` means DNS has not been consulted yet.
    /// </summary>
    [JsonPropertyName("status")]
    public required TrackingDomainRecordStatus Status { get; set; }

    /// <summary>
    /// What DNS returned when it did not match.
    /// </summary>
    [JsonPropertyName("found")]
    public IEnumerable<string> Found { get; set; } = new List<string>();

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
