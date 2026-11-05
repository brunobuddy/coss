using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record EmailEventDataBounce : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// `permanent`, `transient` or `undetermined`.
    /// </summary>
    [JsonPropertyName("type")]
    public required EmailEventDataBounceType Type { get; set; }

    /// <summary>
    /// The provider's finer classification of the bounce.
    /// </summary>
    [JsonPropertyName("sub_type")]
    public required string SubType { get; set; }

    /// <summary>
    /// What the receiving server answered. `null`: not reported.
    /// </summary>
    [Nullable]
    [JsonPropertyName("diagnostic_code")]
    public string? DiagnosticCode { get; set; }

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
