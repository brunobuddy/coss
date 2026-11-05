using Coss;
using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Sign;

[Serializable]
public record CreateSignRequestRequestSignersItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Shown on the signing page and on the certificate.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Where a `delivery: email` signer gets their link. Unique within a request.
    /// </summary>
    [JsonPropertyName("email")]
    public required string Email { get; set; }

    /// <summary>
    /// `email` (default): coss.com emails the signer a link. `embedded`: your app shows the signing page (create a session) and vouches for who the signer is.
    /// </summary>
    [Optional]
    [JsonPropertyName("delivery")]
    public CreateSignRequestRequestSignersItemDelivery? Delivery { get; set; }

    /// <summary>
    /// With `signing_order: "sequential"`, signers sign in increasing `order` (default: their position in `signers`).
    /// </summary>
    [Optional]
    [JsonPropertyName("order")]
    public int? Order { get; set; }

    /// <summary>
    /// Your own id for the signer, recorded in the audit trail.
    /// </summary>
    [Optional]
    [JsonPropertyName("client_ref")]
    public string? ClientRef { get; set; }

    /// <summary>
    /// What this signer fills. Every signer needs at least one `signature` field.
    /// </summary>
    [JsonPropertyName("fields")]
    public IEnumerable<OneOf<SignFieldInputDocument, SignFieldInputAnchor>> Fields { get; set; } =
        new List<OneOf<SignFieldInputDocument, SignFieldInputAnchor>>();

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
