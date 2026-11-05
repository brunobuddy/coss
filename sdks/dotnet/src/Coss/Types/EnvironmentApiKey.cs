using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The API key making this request.
/// </summary>
[Serializable]
public record EnvironmentApiKey : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The key's id.
    /// </summary>
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The key's name. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// The key's first characters, as shown in the dashboard.
    /// </summary>
    [Nullable]
    [JsonPropertyName("start")]
    public string? Start { get; set; }

    /// <summary>
    /// `full`: every permission, including ones new products add later. `restricted`: only `permissions`, chosen when the key was created.
    /// </summary>
    [JsonPropertyName("access")]
    public required EnvironmentApiKeyAccess Access { get; set; }

    /// <summary>
    /// What the key may do now, as `resource:action` (the names `insufficient_permissions` errors use), e.g. `email:send`.
    /// </summary>
    [JsonPropertyName("permissions")]
    public IEnumerable<string> Permissions { get; set; } = new List<string>();

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
