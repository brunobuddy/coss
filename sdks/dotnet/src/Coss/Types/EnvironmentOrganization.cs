using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The organization it belongs to.
/// </summary>
[Serializable]
public record EnvironmentOrganization : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The organization's id.
    /// </summary>
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The organization's name.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// The organization's slug, as in dashboard URLs.
    /// </summary>
    [JsonPropertyName("slug")]
    public required string Slug { get; set; }

    /// <summary>
    /// The organization's pinned API version: what requests without a `Coss-Version` header and new webhook endpoints get.
    /// </summary>
    [JsonPropertyName("api_version")]
    public required string ApiVersion { get; set; }

    /// <summary>
    /// Whether the organization is in HIPAA mode, which refuses some requests with `hipaa_mode_restriction`. Its compliance settings page lists what the mode changes.
    /// </summary>
    [JsonPropertyName("hipaa_mode")]
    public required bool HipaaMode { get; set; }

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
