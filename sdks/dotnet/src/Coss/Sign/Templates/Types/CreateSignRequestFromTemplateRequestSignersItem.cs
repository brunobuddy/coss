using Coss;
using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Sign;

[Serializable]
public record CreateSignRequestFromTemplateRequestSignersItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The `key` of the template's role they sign as.
    /// </summary>
    [JsonPropertyName("role")]
    public required string Role { get; set; }

    /// <summary>
    /// Shown on the signing page and on the certificate.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Where a `delivery: email` signer gets their link.
    /// </summary>
    [JsonPropertyName("email")]
    public required string Email { get; set; }

    /// <summary>
    /// `email` (default): coss.com emails the signer a link. `embedded`: your app shows the signing page.
    /// </summary>
    [Optional]
    [JsonPropertyName("delivery")]
    public CreateSignRequestFromTemplateRequestSignersItemDelivery? Delivery { get; set; }

    /// <summary>
    /// With `sequential` signing, signers sign in increasing `order`.
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
