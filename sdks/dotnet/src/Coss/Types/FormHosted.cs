using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The page coss.com can serve for this form.
/// </summary>
[Serializable]
public record FormHosted : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Whether the page is served at `hosted_url`.
    /// </summary>
    [JsonPropertyName("enabled")]
    public required bool Enabled { get; set; }

    /// <summary>
    /// The page's heading. `null`: the form's name.
    /// </summary>
    [Nullable]
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    /// <summary>
    /// Text under the heading. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    /// <summary>
    /// The submit button's label. `null`: the default.
    /// </summary>
    [Nullable]
    [JsonPropertyName("submit_label")]
    public string? SubmitLabel { get; set; }

    /// <summary>
    /// Shown after a submission. `null`: the default.
    /// </summary>
    [Nullable]
    [JsonPropertyName("success_message")]
    public string? SuccessMessage { get; set; }

    /// <summary>
    /// When the page was turned on, or what it shows last changed. `null`: never published.
    /// </summary>
    [Nullable]
    [JsonPropertyName("published_at")]
    public DateTime? PublishedAt { get; set; }

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
