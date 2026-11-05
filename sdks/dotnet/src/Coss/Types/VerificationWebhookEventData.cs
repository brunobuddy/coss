using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The verification. Never its code.
/// </summary>
[Serializable]
public record VerificationWebhookEventData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The verification's id.
    /// </summary>
    [JsonPropertyName("verification_id")]
    public required string VerificationId { get; set; }

    /// <summary>
    /// `sms` or `email`.
    /// </summary>
    [JsonPropertyName("channel")]
    public required VerificationWebhookEventDataChannel Channel { get; set; }

    /// <summary>
    /// The phone number (E.164) or address the code goes to.
    /// </summary>
    [JsonPropertyName("to")]
    public required string To { get; set; }

    /// <summary>
    /// Its status after this event.
    /// </summary>
    [JsonPropertyName("status")]
    public required VerificationWebhookEventDataStatus Status { get; set; }

    /// <summary>
    /// Why it `failed`. `null` otherwise.
    /// </summary>
    [Nullable]
    [JsonPropertyName("failure")]
    public VerificationWebhookEventDataFailure? Failure { get; set; }

    /// <summary>
    /// Why it was `blocked`. Empty otherwise.
    /// </summary>
    [JsonPropertyName("reasons")]
    public IEnumerable<VerificationWebhookEventDataReasonsItem> Reasons { get; set; } =
        new List<VerificationWebhookEventDataReasonsItem>();

    /// <summary>
    /// Your tags on the verification.
    /// </summary>
    [JsonPropertyName("tags")]
    public IEnumerable<VerificationWebhookEventDataTagsItem> Tags { get; set; } =
        new List<VerificationWebhookEventDataTagsItem>();

    /// <summary>
    /// Whether it's made in a sandbox environment: simulated.
    /// </summary>
    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

    /// <summary>
    /// When this happened.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

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
