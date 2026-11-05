using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Sign;

[Serializable]
public record CreateSignRequestFromTemplateRequest
{
    /// <summary>
    /// The template's id.
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    /// <summary>
    /// Makes retries safe: a repeated request with the same key and body returns the original request (in its current state) instead of creating another, for 24 hours. 1-256 characters.
    /// </summary>
    [JsonIgnore]
    public string? IdempotencyKey { get; set; }

    /// <summary>
    /// Default: the template's title (else its name).
    /// </summary>
    [Optional]
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    /// <summary>
    /// Default: the template's message.
    /// </summary>
    [Optional]
    [JsonPropertyName("message")]
    public string? Message { get; set; }

    /// <summary>
    /// One signer for each of the template's roles.
    /// </summary>
    [JsonPropertyName("signers")]
    public IEnumerable<CreateSignRequestFromTemplateRequestSignersItem> Signers { get; set; } =
        new List<CreateSignRequestFromTemplateRequestSignersItem>();

    /// <summary>
    /// Values of the template's merge fields, by `merge_key`.
    /// </summary>
    [Optional]
    [JsonPropertyName("merge_fields")]
    public Dictionary<string, string>? MergeFields { get; set; }

    /// <summary>
    /// Default: the template's.
    /// </summary>
    [Optional]
    [JsonPropertyName("signing_order")]
    public CreateSignRequestFromTemplateRequestSigningOrder? SigningOrder { get; set; }

    /// <summary>
    /// When an unfinished request expires, at most 365 days ahead.
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
    /// Days between reminders to email signers. Default: your Sign settings'. `null`: none.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("reminder_interval_days")]
    public Optional<int?> ReminderIntervalDays { get; set; }

    /// <summary>
    /// Default `true`.
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
