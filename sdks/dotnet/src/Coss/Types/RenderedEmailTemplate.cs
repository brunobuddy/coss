using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record RenderedEmailTemplate : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required RenderedEmailTemplateObject Object { get; set; }

    /// <summary>
    /// The template's id.
    /// </summary>
    [JsonPropertyName("template_id")]
    public required string TemplateId { get; set; }

    /// <summary>
    /// The version rendered; `null` for the draft.
    /// </summary>
    [Nullable]
    [JsonPropertyName("version")]
    public long? Version { get; set; }

    /// <summary>
    /// The locale rendered.
    /// </summary>
    [JsonPropertyName("locale")]
    public required string Locale { get; set; }

    /// <summary>
    /// The rendered subject.
    /// </summary>
    [JsonPropertyName("subject")]
    public required string Subject { get; set; }

    /// <summary>
    /// The rendered HTML. `null`: the template has none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("html")]
    public string? Html { get; set; }

    /// <summary>
    /// The rendered plain text. `null`: the template has none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("text")]
    public string? Text { get; set; }

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
