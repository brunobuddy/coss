using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record ReceivedEmailSummary : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required ReceivedEmailSummaryObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// `received`, or `blocked` when the message carried a virus: then only its envelope and verdicts are kept, never its content.
    /// </summary>
    [JsonPropertyName("status")]
    public required ReceivedEmailSummaryStatus Status { get; set; }

    /// <summary>
    /// Why it's `blocked`. `null`: it isn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("blocked_reason")]
    public ReceivedEmailSummaryBlockedReason? BlockedReason { get; set; }

    /// <summary>
    /// The envelope sender (`MAIL FROM`); empty for bounces.
    /// </summary>
    [JsonPropertyName("mail_from")]
    public required string MailFrom { get; set; }

    /// <summary>
    /// The envelope recipients this environment received the message for (Bcc'd addresses included, other organizations' never).
    /// </summary>
    [JsonPropertyName("recipients")]
    public IEnumerable<string> Recipients { get; set; } = new List<string>();

    /// <summary>
    /// The `From` header.
    /// </summary>
    [Nullable]
    [JsonPropertyName("from")]
    public string? From { get; set; }

    /// <summary>
    /// The `To` header's addresses.
    /// </summary>
    [JsonPropertyName("to")]
    public IEnumerable<string> To { get; set; } = new List<string>();

    /// <summary>
    /// The `Cc` header's addresses.
    /// </summary>
    [JsonPropertyName("cc")]
    public IEnumerable<string> Cc { get; set; } = new List<string>();

    /// <summary>
    /// The `Subject` header. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("subject")]
    public string? Subject { get; set; }

    /// <summary>
    /// The `Message-ID` header.
    /// </summary>
    [Nullable]
    [JsonPropertyName("message_id")]
    public string? MessageId { get; set; }

    /// <summary>
    /// Its attachments, without their bytes.
    /// </summary>
    [JsonPropertyName("attachments")]
    public IEnumerable<ReceivedEmailAttachment> Attachments { get; set; } =
        new List<ReceivedEmailAttachment>();

    /// <summary>
    /// Size of the raw message in bytes.
    /// </summary>
    [JsonPropertyName("size")]
    public required long Size { get; set; }

    /// <summary>
    /// Whether the spam verdict is `fail`.
    /// </summary>
    [JsonPropertyName("spam")]
    public required bool Spam { get; set; }

    [JsonPropertyName("verdicts")]
    public required ReceivedEmailVerdicts Verdicts { get; set; }

    /// <summary>
    /// Whether it was received by a sandbox environment.
    /// </summary>
    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

    /// <summary>
    /// When it arrived.
    /// </summary>
    [JsonPropertyName("received_at")]
    public required DateTime ReceivedAt { get; set; }

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
