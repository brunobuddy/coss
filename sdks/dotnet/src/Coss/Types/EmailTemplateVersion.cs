using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record EmailTemplateVersion : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required EmailTemplateVersionObject Object { get; set; }

    /// <summary>
    /// The template's id.
    /// </summary>
    [JsonPropertyName("template_id")]
    public required string TemplateId { get; set; }

    /// <summary>
    /// The version number; `null` for the draft.
    /// </summary>
    [Nullable]
    [JsonPropertyName("version")]
    public long? Version { get; set; }

    /// <summary>
    /// Counts the draft's saves. A published version keeps the revision it was published from.
    /// </summary>
    [JsonPropertyName("revision")]
    public required long Revision { get; set; }

    /// <summary>
    /// The locale sends fall back to when they ask for none, or for one without content.
    /// </summary>
    [JsonPropertyName("default_locale")]
    public required string DefaultLocale { get; set; }

    /// <summary>
    /// The variables the template uses, with their types.
    /// </summary>
    [JsonPropertyName("variables")]
    public IEnumerable<TemplateVariable> Variables { get; set; } = new List<TemplateVariable>();

    /// <summary>
    /// Example values for previews and test sends in the dashboard.
    /// </summary>
    [JsonPropertyName("sample_variables")]
    public Dictionary<string, object?> SampleVariables { get; set; } =
        new Dictionary<string, object?>();

    /// <summary>
    /// The subject, HTML and text per locale.
    /// </summary>
    [JsonPropertyName("contents")]
    public IEnumerable<TemplateContent> Contents { get; set; } = new List<TemplateContent>();

    /// <summary>
    /// Syntax errors and undeclared variables per locale and field, which keep a draft from being published. Always empty for published versions.
    /// </summary>
    [JsonPropertyName("problems")]
    public IEnumerable<TemplateProblem> Problems { get; set; } = new List<TemplateProblem>();

    /// <summary>
    /// When this version was published. `null` for the draft.
    /// </summary>
    [Nullable]
    [JsonPropertyName("published_at")]
    public DateTime? PublishedAt { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required DateTime UpdatedAt { get; set; }

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
