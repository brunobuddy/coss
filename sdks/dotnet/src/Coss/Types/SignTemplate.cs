using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SignTemplate : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SignTemplateObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// Your name for the template.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Requests' title. `null`: the template's name.
    /// </summary>
    [Nullable]
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    /// <summary>
    /// Requests' message to signers. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("message")]
    public string? Message { get; set; }

    /// <summary>
    /// Its requests' order, unless one sets its own.
    /// </summary>
    [JsonPropertyName("signing_order")]
    public required SignTemplateSigningOrder SigningOrder { get; set; }

    /// <summary>
    /// The documents its requests use, in order.
    /// </summary>
    [JsonPropertyName("documents")]
    public IEnumerable<SignTemplateDocumentsItem> Documents { get; set; } =
        new List<SignTemplateDocumentsItem>();

    /// <summary>
    /// Who signs: each request names one signer per role.
    /// </summary>
    [JsonPropertyName("roles")]
    public IEnumerable<SignTemplateRolesItem> Roles { get; set; } =
        new List<SignTemplateRolesItem>();

    /// <summary>
    /// Each role's fields.
    /// </summary>
    [JsonPropertyName("fields")]
    public IEnumerable<SignTemplateFieldsItem> Fields { get; set; } =
        new List<SignTemplateFieldsItem>();

    /// <summary>
    /// It has documents and every role has a `signature` field, so requests can be made from it.
    /// </summary>
    [JsonPropertyName("ready")]
    public required bool Ready { get; set; }

    /// <summary>
    /// Whether it belongs to a sandbox environment.
    /// </summary>
    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

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
