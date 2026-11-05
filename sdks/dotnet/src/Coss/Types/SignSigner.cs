using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Someone asked to sign.
/// </summary>
[Serializable]
public record SignSigner : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SignSignerObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("name")]
    public required string Name { get; set; }

    [JsonPropertyName("email")]
    public required string Email { get; set; }

    /// <summary>
    /// Where they come in `signing_order: sequential`. Lower signs first.
    /// </summary>
    [JsonPropertyName("order")]
    public required long Order { get; set; }

    /// <summary>
    /// `email`: coss.com emails them a link. `embedded`: your app shows the signing page.
    /// </summary>
    [JsonPropertyName("delivery")]
    public required SignSignerDelivery Delivery { get; set; }

    /// <summary>
    /// How the signer is identified: `email_link` (they opened the link coss.com emailed) or `customer_asserted` (your app vouched for them).
    /// </summary>
    [JsonPropertyName("authentication")]
    public required SignSignerAuthentication Authentication { get; set; }

    /// <summary>
    /// `pending`: not contacted yet. `notified`: emailed their link. `viewed`: opened the signing page. `signed`: done. `declined`: refused, which declines the whole request.
    /// </summary>
    [JsonPropertyName("status")]
    public required SignSignerStatus Status { get; set; }

    /// <summary>
    /// Your own id for the signer. `null`: none given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("client_ref")]
    public string? ClientRef { get; set; }

    /// <summary>
    /// When they first opened the signing page. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("viewed_at")]
    public DateTime? ViewedAt { get; set; }

    /// <summary>
    /// When they signed. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("signed_at")]
    public DateTime? SignedAt { get; set; }

    /// <summary>
    /// When they declined. `null`: they haven't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("declined_at")]
    public DateTime? DeclinedAt { get; set; }

    /// <summary>
    /// The reason they gave. `null`: none given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("decline_reason")]
    public string? DeclineReason { get; set; }

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
