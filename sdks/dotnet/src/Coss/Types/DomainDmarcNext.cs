using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record DomainDmarcNext : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The kind of step this is.
    /// </summary>
    [JsonPropertyName("kind")]
    public required DomainDmarcNextKind Kind { get; set; }

    /// <summary>
    /// The policy that step gets to.
    /// </summary>
    [JsonPropertyName("policy")]
    public required DomainDmarcNextPolicy Policy { get; set; }

    /// <summary>
    /// The TXT record to publish at `_dmarc.&lt;domain&gt;`.
    /// </summary>
    [JsonPropertyName("record")]
    public required string Record { get; set; }

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
