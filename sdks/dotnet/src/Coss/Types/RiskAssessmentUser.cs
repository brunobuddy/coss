using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Who it's about.
/// </summary>
[Serializable]
public record RiskAssessmentUser : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Your user id. `null`: none given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    /// <summary>
    /// `null` once removed (90 days after the assessment) or when none was given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("email")]
    public string? Email { get; set; }

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
