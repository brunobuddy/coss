using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Sign;

[Serializable]
public record CreateSignTemplateRequest
{
    /// <summary>
    /// Your name for the template.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Requests' title (a request may set its own). Default: `name`.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("title")]
    public Optional<string?> Title { get; set; }

    /// <summary>
    /// Requests' message to signers (a request may set its own).
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("message")]
    public Optional<string?> Message { get; set; }

    /// <summary>
    /// `parallel`: everyone at once. `sequential`: in each signer's `order`. Default for its requests.
    /// </summary>
    [Optional]
    [JsonPropertyName("signing_order")]
    public CreateSignTemplateRequestSigningOrder? SigningOrder { get; set; }

    /// <summary>
    /// Uploaded documents by id, or PDFs inline (base64).
    /// </summary>
    [Optional]
    [JsonPropertyName("documents")]
    public IEnumerable<
        OneOf<
            CreateSignTemplateRequestDocumentsItemDocumentId,
            CreateSignTemplateRequestDocumentsItemContent
        >
    >? Documents { get; set; }

    /// <summary>
    /// Who signs: each request names one signer per role.
    /// </summary>
    [Optional]
    [JsonPropertyName("roles")]
    public IEnumerable<CreateSignTemplateRequestRolesItem>? Roles { get; set; }

    /// <summary>
    /// Each role's fields, by position or text anchor (resolved when saved). A template can be used once every role has a `signature` field.
    /// </summary>
    [Optional]
    [JsonPropertyName("fields")]
    public IEnumerable<
        OneOf<
            CreateSignTemplateRequestFieldsItemDocument,
            CreateSignTemplateRequestFieldsItemAnchor
        >
    >? Fields { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
