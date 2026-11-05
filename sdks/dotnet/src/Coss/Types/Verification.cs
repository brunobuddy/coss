using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record Verification : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required VerificationObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// `sms` or `email`.
    /// </summary>
    [JsonPropertyName("channel")]
    public required VerificationChannel Channel { get; set; }

    /// <summary>
    /// The phone number (E.164) or address the code goes to.
    /// </summary>
    [JsonPropertyName("to")]
    public required string To { get; set; }

    /// <summary>
    /// ISO 3166 country of a phone number.
    /// </summary>
    [Nullable]
    [JsonPropertyName("country")]
    public string? Country { get; set; }

    /// <summary>
    /// `pending` until the right code is checked (`approved`) or it ends: `expired`, `canceled`, `failed` (too many wrong codes, or the code couldn't be sent) or `blocked` (the fraud guard stopped it before anything was sent).
    /// </summary>
    [JsonPropertyName("status")]
    public required VerificationStatus Status { get; set; }

    /// <summary>
    /// Why it `failed`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("failure")]
    public VerificationFailure? Failure { get; set; }

    /// <summary>
    /// Why it was `blocked` (empty otherwise).
    /// </summary>
    [JsonPropertyName("reasons")]
    public IEnumerable<VerificationReasonsItem> Reasons { get; set; } =
        new List<VerificationReasonsItem>();

    /// <summary>
    /// Wrong codes checked so far.
    /// </summary>
    [JsonPropertyName("attempts")]
    public required long Attempts { get; set; }

    /// <summary>
    /// How many wrong codes end it.
    /// </summary>
    [JsonPropertyName("max_attempts")]
    public required long MaxAttempts { get; set; }

    /// <summary>
    /// Each time the code was sent.
    /// </summary>
    [JsonPropertyName("sends")]
    public IEnumerable<VerificationSend> Sends { get; set; } = new List<VerificationSend>();

    /// <summary>
    /// Your tags on the verification.
    /// </summary>
    [JsonPropertyName("tags")]
    public IEnumerable<VerificationTagsItem> Tags { get; set; } = new List<VerificationTagsItem>();

    /// <summary>
    /// Made in a sandbox environment: simulated, and the code is always zeros.
    /// </summary>
    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

    /// <summary>
    /// When the code stops working.
    /// </summary>
    [JsonPropertyName("expires_at")]
    public required DateTime ExpiresAt { get; set; }

    /// <summary>
    /// When the right code was checked. `null`: it wasn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("approved_at")]
    public DateTime? ApprovedAt { get; set; }

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
