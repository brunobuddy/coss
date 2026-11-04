using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record FormFieldInput : IJsonOnDeserialized
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
    /// Validates the value (`email`, `number`, `url`, `date` as `YYYY-MM-DD`, `select`/`radio` one of `options`, `checkbox` any of them or `on`) and picks the input on hosted pages. `file` needs uploads on (`files.enabled`).
    /// </summary>
    [JsonPropertyName("type")]
    public required FormFieldInputType Type { get; set; }

    /// <summary>
    /// Shown on hosted pages and in notifications. Default: the name.
    /// </summary>
    [Optional]
    [JsonPropertyName("label")]
    public string? Label { get; set; }

    /// <summary>
    /// Default false.
    /// </summary>
    [Optional]
    [JsonPropertyName("required")]
    public bool? Required { get; set; }

    /// <summary>
    /// Shown in the empty input on hosted pages.
    /// </summary>
    [Optional]
    [JsonPropertyName("placeholder")]
    public string? Placeholder { get; set; }

    /// <summary>
    /// The choices of `select`, `radio` and `checkbox` fields.
    /// </summary>
    [Optional]
    [JsonPropertyName("options")]
    public IEnumerable<string>? Options { get; set; }

    /// <summary>
    /// The longest value accepted, in characters.
    /// </summary>
    [Optional]
    [JsonPropertyName("max_length")]
    public int? MaxLength { get; set; }

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
