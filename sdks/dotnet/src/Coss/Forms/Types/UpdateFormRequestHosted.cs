using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The page coss.com can serve for this form. Only the fields given change.
/// </summary>
[Serializable]
public record UpdateFormRequestHosted : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Serve the form as a page at its `hosted_url` (needs `fields`). Default false.
    /// </summary>
    [Optional]
    [JsonPropertyName("enabled")]
    public bool? Enabled { get; set; }

    /// <summary>
    /// The page's heading. `null`: the form's name.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("title")]
    public Optional<string?> Title { get; set; }

    /// <summary>
    /// Text under the heading. `null`: none.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("description")]
    public Optional<string?> Description { get; set; }

    /// <summary>
    /// The submit button's label. `null`: the default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("submit_label")]
    public Optional<string?> SubmitLabel { get; set; }

    /// <summary>
    /// Shown after a submission. `null`: the default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("success_message")]
    public Optional<string?> SuccessMessage { get; set; }

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
