using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Email;

[Serializable]
public record CreateBroadcastRequest
{
    /// <summary>
    /// Makes retries safe: a repeated request with the same key and body returns the broadcast created first instead of creating another, for 24 hours. 1-256 characters.
    /// </summary>
    [JsonIgnore]
    public string? IdempotencyKey { get; set; }

    /// <summary>
    /// Shown only to you.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Send to this audience…
    /// </summary>
    [Optional]
    [JsonPropertyName("audience_id")]
    public string? AudienceId { get; set; }

    /// <summary>
    /// …or to this segment (one of the two).
    /// </summary>
    [Optional]
    [JsonPropertyName("segment_id")]
    public string? SegmentId { get; set; }

    /// <summary>
    /// The topic the broadcast is about (its key): only contacts it reaches get it, and its unsubscribe link leaves just that topic. It is the emails' `category`.
    /// </summary>
    [Optional]
    [JsonPropertyName("topic")]
    public string? Topic { get; set; }

    [JsonPropertyName("from")]
    public required string From { get; set; }

    /// <summary>
    /// Addresses replies go to.
    /// </summary>
    [Optional]
    [JsonPropertyName("reply_to")]
    public IEnumerable<string>? ReplyTo { get; set; }

    /// <summary>
    /// May use `{{{contact.&lt;key&gt;|fallback}}}` (e.g. `{{{contact.first_name|there}}}`).
    /// </summary>
    [JsonPropertyName("subject")]
    public required string Subject { get; set; }

    /// <summary>
    /// The inbox preview line (a hidden preheader at the start of the HTML).
    /// </summary>
    [Optional]
    [JsonPropertyName("preview_text")]
    public string? PreviewText { get; set; }

    /// <summary>
    /// `{{{contact.&lt;key&gt;|fallback}}}` for contact fields and properties (escaped), and `{{{unsubscribe_url}}}`, `{{{preferences_url}}}`, `{{{mailing_address}}}`; a footer with the postal address and an unsubscribe link is added unless they are there.
    /// </summary>
    [Optional]
    [JsonPropertyName("html")]
    public string? Html { get; set; }

    /// <summary>
    /// The plain text part. Takes the same placeholders as `html`.
    /// </summary>
    [Optional]
    [JsonPropertyName("text")]
    public string? Text { get; set; }

    /// <summary>
    /// Which opens and clicks are tracked.
    /// </summary>
    [Optional]
    [JsonPropertyName("tracking")]
    public CreateBroadcastRequestTracking? Tracking { get; set; }

    /// <summary>
    /// Recipients per second, at most the plan's marketing rate (the default).
    /// </summary>
    [Optional]
    [JsonPropertyName("rate_per_second")]
    public int? RatePerSecond { get; set; }

    /// <summary>
    /// Start sending right away.
    /// </summary>
    [Optional]
    [JsonPropertyName("send")]
    public bool? Send { get; set; }

    /// <summary>
    /// Start sending at this time (ISO 8601 with an offset, at most 30 days ahead).
    /// </summary>
    [Optional]
    [JsonPropertyName("scheduled_at")]
    public DateTime? ScheduledAt { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
