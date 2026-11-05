using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The MX record to publish, with the result of the last check. Mail for the hostname is received as soon as it reaches coss.com; the check only shows what DNS serves.
/// </summary>
[Serializable]
public record ReceivingDomainRecord : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The record's type.
    /// </summary>
    [JsonPropertyName("type")]
    public required ReceivingDomainRecordType Type { get; set; }

    /// <summary>
    /// The fully qualified record name to create.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// The mail exchange the record must point at.
    /// </summary>
    [JsonPropertyName("value")]
    public required string Value { get; set; }

    /// <summary>
    /// The MX record's priority.
    /// </summary>
    [JsonPropertyName("priority")]
    public required long Priority { get; set; }

    /// <summary>
    /// What the last DNS check saw: `verified` once the most preferred MX records point at coss.com. `not_checked` means DNS has not been consulted yet.
    /// </summary>
    [JsonPropertyName("status")]
    public required ReceivingDomainRecordStatus Status { get; set; }

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
