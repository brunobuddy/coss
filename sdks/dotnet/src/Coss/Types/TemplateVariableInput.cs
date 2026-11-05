using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

[Serializable]
public record TemplateVariableInput : IJsonOnDeserialized
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
    /// `string`, `number`, `boolean`, or `list` (an array of objects with the declared `fields`, looped over with `{{#each name}}`).
    /// </summary>
    [JsonPropertyName("type")]
    public required TemplateVariableInputType Type { get; set; }

    /// <summary>
    /// Sends must pass it unless it has a `default`. Defaults to true.
    /// </summary>
    [Optional]
    [JsonPropertyName("required")]
    public bool? Required { get; set; }

    /// <summary>
    /// Used when a send leaves it out. Not for lists.
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
    /// A list's item fields (required for lists, only for lists).
    /// </summary>
    [Optional]
    [JsonPropertyName("fields")]
    public IEnumerable<TemplateVariableInputFieldsItem>? Fields { get; set; }

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
