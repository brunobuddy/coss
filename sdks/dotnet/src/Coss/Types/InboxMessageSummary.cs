using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record InboxMessageSummary : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required InboxMessageSummaryObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("inbox_id")]
    public required string InboxId { get; set; }

    [JsonPropertyName("thread_id")]
    public required string ThreadId { get; set; }

    /// <summary>
    /// `inbound`: received by the inbox. `outbound`: sent from it.
    /// </summary>
    [JsonPropertyName("direction")]
    public required InboxMessageSummaryDirection Direction { get; set; }

    /// <summary>
    /// `received` for inbound messages; an outbound message's email status (`queued`, `sent`, `failed`, …): its email has each recipient's delivery.
    /// </summary>
    [JsonPropertyName("status")]
    public required InboxMessageSummaryStatus Status { get; set; }

    /// <summary>
    /// The `From` header.
    /// </summary>
    [Nullable]
    [JsonPropertyName("from")]
    public string? From { get; set; }

    /// <summary>
    /// Addresses in the `To` header.
    /// </summary>
    [JsonPropertyName("to")]
    public IEnumerable<string> To { get; set; } = new List<string>();

    /// <summary>
    /// Addresses in the `Cc` header.
    /// </summary>
    [JsonPropertyName("cc")]
    public IEnumerable<string> Cc { get; set; } = new List<string>();

    /// <summary>
    /// The subject. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("subject")]
    public string? Subject { get; set; }

    /// <summary>
    /// The start of the message's own text (without the quoted conversation).
    /// </summary>
    [Nullable]
    [JsonPropertyName("preview")]
    public string? Preview { get; set; }

    /// <summary>
    /// An inbound message's attachments (download them from the message).
    /// </summary>
    [JsonPropertyName("attachments")]
    public IEnumerable<ReceivedEmailAttachment> Attachments { get; set; } =
        new List<ReceivedEmailAttachment>();

    /// <summary>
    /// Whether the receiving server judged it spam.
    /// </summary>
    [JsonPropertyName("spam")]
    public required bool Spam { get; set; }

    /// <summary>
    /// The received email of an inbound message.
    /// </summary>
    [Nullable]
    [JsonPropertyName("received_email_id")]
    public string? ReceivedEmailId { get; set; }

    /// <summary>
    /// The email of an outbound message: its delivery events and webhooks name it.
    /// </summary>
    [Nullable]
    [JsonPropertyName("email_id")]
    public string? EmailId { get; set; }

    /// <summary>
    /// When it was received or sent.
    /// </summary>
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
