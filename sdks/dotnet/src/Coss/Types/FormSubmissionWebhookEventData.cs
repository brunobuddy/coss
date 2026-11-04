using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

/// <summary>
/// The submission.
/// </summary>
[Serializable]
public record FormSubmissionWebhookEventData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The form's id.
    /// </summary>
    [JsonPropertyName("form_id")]
    public required string FormId { get; set; }

    /// <summary>
    /// The form's name.
    /// </summary>
    [JsonPropertyName("form_name")]
    public required string FormName { get; set; }

    /// <summary>
    /// The submission's id.
    /// </summary>
    [JsonPropertyName("submission_id")]
    public required string SubmissionId { get; set; }

    /// <summary>
    /// The submission's status after this event.
    /// </summary>
    [JsonPropertyName("status")]
    public required FormSubmissionWebhookEventDataStatus Status { get; set; }

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
    /// Uploaded files (download them with the API; never their bytes here).
    /// </summary>
    [JsonPropertyName("files")]
    public IEnumerable<FormSubmissionFile> Files { get; set; } = new List<FormSubmissionFile>();

    /// <summary>
    /// Why it was flagged. `null`: not flagged.
    /// </summary>
    [Nullable]
    [JsonPropertyName("spam_reason")]
    public FormSubmissionWebhookEventDataSpamReason? SpamReason { get; set; }

    /// <summary>
    /// Whether it belongs to a sandbox environment.
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
