using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Email;

[Serializable]
public record CreateEmailTemplateRequest
{
    /// <summary>
    /// Shown in the dashboard.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// A name to send the template by instead of its id, e.g. `welcome`: the same alias can be used in every environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("alias")]
    public string? Alias { get; set; }

    /// <summary>
    /// Your note about it, shown in the dashboard.
    /// </summary>
    [Optional]
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    /// <summary>
    /// The locale sends fall back to when they ask for none, or for one without content. Defaults to the first entry of `contents` (or "en").
    /// </summary>
    [Optional]
    [JsonPropertyName("default_locale")]
    public string? DefaultLocale { get; set; }

    /// <summary>
    /// The variables the template uses, with their types.
    /// </summary>
    [Optional]
    [JsonPropertyName("variables")]
    public IEnumerable<TemplateVariableInput>? Variables { get; set; }

    /// <summary>
    /// Example values for previews and test sends in the dashboard.
    /// </summary>
    [Optional]
    [JsonPropertyName("sample_variables")]
    public Dictionary<string, object?>? SampleVariables { get; set; }

    /// <summary>
    /// The subject, HTML and text per locale.
    /// </summary>
    [Optional]
    [JsonPropertyName("contents")]
    public IEnumerable<TemplateContentInput>? Contents { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
