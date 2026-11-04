using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

[Serializable]
public record TemplateVariable : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Used in the template as `{{name}}`.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// `string`, `number`, `boolean`, or `list` (an array of objects with the declared `fields`).
    /// </summary>
    [JsonPropertyName("type")]
    public required TemplateVariableType Type { get; set; }

    /// <summary>
    /// Whether sends must pass it, unless it has a `default`.
    /// </summary>
    [JsonPropertyName("required")]
    public required bool Required { get; set; }

    /// <summary>
    /// Used when a send leaves it out.
    /// </summary>
    [Optional]
    [JsonPropertyName("default")]
    public OneOf<string, double, bool>? Default { get; set; }

    /// <summary>
    /// What it's for, shown in the dashboard.
    /// </summary>
    [Optional]
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    /// <summary>
    /// A list's item fields.
    /// </summary>
    [Optional]
    [JsonPropertyName("fields")]
    public IEnumerable<TemplateVariableFieldsItem>? Fields { get; set; }

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
