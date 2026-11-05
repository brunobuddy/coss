using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record VerificationSend : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// `sms` or `email`.
    /// </summary>
    [JsonPropertyName("channel")]
    public required VerificationSendChannel Channel { get; set; }

    /// <summary>
    /// `own_number`: one of your numbers; `shared_number`: coss.com's; `email`: your sender; `coss_email`: coss.com's sender.
    /// </summary>
    [JsonPropertyName("route")]
    public required VerificationSendRoute Route { get; set; }

    /// <summary>
    /// The SMS, in your environment: `own_number`, or any in a sandbox environment (`null` for coss.com's shared numbers' messages).
    /// </summary>
    [Nullable]
    [JsonPropertyName("sms_id")]
    public string? SmsId { get; set; }

    /// <summary>
    /// The email (`email` route only).
    /// </summary>
    [Nullable]
    [JsonPropertyName("email_id")]
    public string? EmailId { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

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
