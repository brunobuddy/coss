using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record FormField : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The `name` the form's input posts.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Validates the value and picks the input on hosted pages.
    /// </summary>
    [JsonPropertyName("type")]
    public required FormFieldType Type { get; set; }

    /// <summary>
    /// Shown on hosted pages and in notifications. `null`: the name.
    /// </summary>
    [Nullable]
    [JsonPropertyName("label")]
    public string? Label { get; set; }

    /// <summary>
    /// Whether a submission must include it.
    /// </summary>
    [JsonPropertyName("required")]
    public required bool Required { get; set; }

    /// <summary>
    /// Shown in the empty input on hosted pages. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("placeholder")]
    public string? Placeholder { get; set; }

    /// <summary>
    /// The choices of `select`, `radio` and `checkbox` fields. Empty for other types.
    /// </summary>
    [JsonPropertyName("options")]
    public IEnumerable<string> Options { get; set; } = new List<string>();

    /// <summary>
    /// The longest value accepted, in characters. `null`: only the overall limit.
    /// </summary>
    [Nullable]
    [JsonPropertyName("max_length")]
    public long? MaxLength { get; set; }

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
