using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Sign;

[Serializable]
public record CreateSignRequestRequest
{
    /// <summary>
    /// Makes retries safe: a repeated request with the same key and body returns the original request (in its current state) instead of creating another, for 24 hours. 1-256 characters.
    /// </summary>
    [JsonIgnore]
    public string? IdempotencyKey { get; set; }

    /// <summary>
    /// Shown to signers.
    /// </summary>
    [JsonPropertyName("title")]
    public required string Title { get; set; }

    /// <summary>
    /// A note to signers.
    /// </summary>
    [Optional]
    [JsonPropertyName("message")]
    public string? Message { get; set; }

    /// <summary>
    /// Uploaded documents by id, or PDFs inline (base64).
    /// </summary>
    [JsonPropertyName("documents")]
    public IEnumerable<
        OneOf<
            CreateSignRequestRequestDocumentsItemDocumentId,
            CreateSignRequestRequestDocumentsItemContent
        >
    > Documents { get; set; } =
        new List<
            OneOf<
                CreateSignRequestRequestDocumentsItemDocumentId,
                CreateSignRequestRequestDocumentsItemContent
            >
        >();

    /// <summary>
    /// Who signs, and what each fills.
    /// </summary>
    [JsonPropertyName("signers")]
    public IEnumerable<CreateSignRequestRequestSignersItem> Signers { get; set; } =
        new List<CreateSignRequestRequestSignersItem>();

    /// <summary>
    /// `parallel` (default): everyone at once. `sequential`: in each signer's `order`.
    /// </summary>
    [Optional]
    [JsonPropertyName("signing_order")]
    public CreateSignRequestRequestSigningOrder? SigningOrder { get; set; }

    /// <summary>
    /// When unsigned requests expire (at most 365 days ahead).
    /// </summary>
    [Optional]
    [JsonPropertyName("expires_at")]
    public DateTime? ExpiresAt { get; set; }

    /// <summary>
    /// Your own key-value pairs, returned with the request and its webhooks.
    /// </summary>
    [Optional]
    [JsonPropertyName("metadata")]
    public Dictionary<string, string>? Metadata { get; set; }

    /// <summary>
    /// Email signers who haven't signed get a reminder every this many days (up to 3). Default: your Sign settings' `reminder_interval_days`; `null`: none.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("reminder_interval_days")]
    public Optional<int?> ReminderIntervalDays { get; set; }

    /// <summary>
    /// Default `true`: send at once. `false` keeps a `draft` to send later.
    /// </summary>
    [Optional]
    [JsonPropertyName("send")]
    public bool? Send { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
