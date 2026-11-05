using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

[Serializable]
public record FormSubmission : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required FormSubmissionObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The id of the form it was posted to.
    /// </summary>
    [JsonPropertyName("form_id")]
    public required string FormId { get; set; }

    /// <summary>
    /// `accepted`: delivered (webhooks, notifications, contacts). `held`: Risk asked for a review. `spam`: refused by Risk, the content check or the honeypot. `pending_confirmation`: waiting for the submitter's email link.
    /// </summary>
    [JsonPropertyName("status")]
    public required FormSubmissionStatus Status { get; set; }

    /// <summary>
    /// Field name → value; a field posted several times has an array.
    /// </summary>
    [JsonPropertyName("data")]
    public Dictionary<string, OneOf<string, IEnumerable<string>>> Data { get; set; } =
        new Dictionary<string, OneOf<string, IEnumerable<string>>>();

    /// <summary>
    /// The value of the form's `submitter.email_field`. `null` when it has none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("submitter_email")]
    public string? SubmitterEmail { get; set; }

    /// <summary>
    /// Uploaded files. Download them with the API.
    /// </summary>
    [JsonPropertyName("files")]
    public IEnumerable<FormSubmissionFile> Files { get; set; } = new List<FormSubmissionFile>();

    /// <summary>
    /// Why it was flagged. `honeypot`: the honeypot field was filled. `risk_block`: Risk blocked it. `risk_review`: Risk asked for a review. `content`: its text passed `content_threshold`. `null`: not flagged.
    /// </summary>
    [Nullable]
    [JsonPropertyName("spam_reason")]
    public FormSubmissionSpamReason? SpamReason { get; set; }

    /// <summary>
    /// Risk's assessment; `null` when none ran (honeypot).
    /// </summary>
    [Nullable]
    [JsonPropertyName("risk")]
    public FormSubmissionRisk? Risk { get; set; }

    /// <summary>
    /// The address it was posted from. `null`: unknown.
    /// </summary>
    [Nullable]
    [JsonPropertyName("ip")]
    public string? Ip { get; set; }

    /// <summary>
    /// The browser's `User-Agent`. `null`: not sent.
    /// </summary>
    [Nullable]
    [JsonPropertyName("user_agent")]
    public string? UserAgent { get; set; }

    /// <summary>
    /// The site it was posted from. `null`: not sent.
    /// </summary>
    [Nullable]
    [JsonPropertyName("origin")]
    public string? Origin { get; set; }

    /// <summary>
    /// The page it was posted from. `null`: not sent.
    /// </summary>
    [Nullable]
    [JsonPropertyName("referrer")]
    public string? Referrer { get; set; }

    /// <summary>
    /// When the submitter clicked the emailed link. `null`: they haven't, or the form doesn't verify.
    /// </summary>
    [Nullable]
    [JsonPropertyName("confirmed_at")]
    public DateTime? ConfirmedAt { get; set; }

    /// <summary>
    /// When it became `accepted`. `null`: it hasn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("accepted_at")]
    public DateTime? AcceptedAt { get; set; }

    /// <summary>
    /// When it was released from `held` or `spam`. `null`: it wasn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("released_at")]
    public DateTime? ReleasedAt { get; set; }

    /// <summary>
    /// Whether it belongs to a sandbox environment.
    /// </summary>
    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

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
