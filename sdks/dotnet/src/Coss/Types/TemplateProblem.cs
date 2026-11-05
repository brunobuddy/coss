using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record TemplateProblem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The locale whose content it's in.
    /// </summary>
    [JsonPropertyName("locale")]
    public required string Locale { get; set; }

    /// <summary>
    /// The part of the content it's in.
    /// </summary>
    [JsonPropertyName("field")]
    public required TemplateProblemField Field { get; set; }

    /// <summary>
    /// What's wrong.
    /// </summary>
    [JsonPropertyName("message")]
    public required string Message { get; set; }

    /// <summary>
    /// The line it's on, from 1.
    /// </summary>
    [JsonPropertyName("line")]
    public required long Line { get; set; }

    /// <summary>
    /// The column it's at, from 1.
    /// </summary>
    [JsonPropertyName("column")]
    public required long Column { get; set; }

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
