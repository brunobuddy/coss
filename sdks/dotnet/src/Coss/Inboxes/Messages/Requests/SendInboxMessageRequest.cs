using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Inboxes;

[Serializable]
public record SendInboxMessageRequest
{
    /// <summary>
    /// The inbox's id.
    /// </summary>
    [JsonIgnore]
    public required string InboxId { get; set; }

    /// <summary>
    /// Makes the send safe to retry: a repeat with the same key and body returns the first message instead of sending again (keys are per inbox). 1-256 characters.
    /// </summary>
    [JsonIgnore]
    public string? IdempotencyKey { get; set; }

    /// <summary>
    /// Who it goes to.
    /// </summary>
    [JsonPropertyName("to")]
    public required OneOf<string, IEnumerable<string>> To { get; set; }

    /// <summary>
    /// Who it's copied to.
    /// </summary>
    [Optional]
    [JsonPropertyName("cc")]
    public OneOf<string, IEnumerable<string>>? Cc { get; set; }

    /// <summary>
    /// Who it's blind copied to.
    /// </summary>
    [Optional]
    [JsonPropertyName("bcc")]
    public OneOf<string, IEnumerable<string>>? Bcc { get; set; }

    /// <summary>
    /// The new thread's subject.
    /// </summary>
    [JsonPropertyName("subject")]
    public required string Subject { get; set; }

    /// <summary>
    /// Plain-text body. Without it, an `html` email goes out with a text part generated from the HTML.
    /// </summary>
    [Optional]
    [JsonPropertyName("text")]
    public string? Text { get; set; }

    /// <summary>
    /// HTML body. Provide `html`, `text`, or both.
    /// </summary>
    [Optional]
    [JsonPropertyName("html")]
    public string? Html { get; set; }

    /// <summary>
    /// Up to 20 files, at most 25 MB combined.
    /// </summary>
    [Optional]
    [JsonPropertyName("attachments")]
    public IEnumerable<SendEmailAttachment>? Attachments { get; set; }

    /// <summary>
    /// Your tags on the email.
    /// </summary>
    [Optional]
    [JsonPropertyName("tags")]
    public IEnumerable<SendInboxMessageRequestTagsItem>? Tags { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
