using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Email;

[Serializable]
public record UpdateBroadcastRequest
{
    /// <summary>
    /// The broadcast's id.
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    /// <summary>
    /// Shown only to you.
    /// </summary>
    [Optional]
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// Send to this audience. `null` clears it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("audience_id")]
    public Optional<string?> AudienceId { get; set; }

    /// <summary>
    /// Send to this segment. `null` clears it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("segment_id")]
    public Optional<string?> SegmentId { get; set; }

    /// <summary>
    /// The topic it's about (its key). `null` clears it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("topic")]
    public Optional<string?> Topic { get; set; }

    [Optional]
    [JsonPropertyName("from")]
    public string? From { get; set; }

    /// <summary>
    /// Addresses replies go to.
    /// </summary>
    [Optional]
    [JsonPropertyName("reply_to")]
    public IEnumerable<string>? ReplyTo { get; set; }

    /// <summary>
    /// May use `{{{contact.&lt;key&gt;|fallback}}}` (e.g. `{{{contact.first_name|there}}}`).
    /// </summary>
    [Optional]
    [JsonPropertyName("subject")]
    public string? Subject { get; set; }

    /// <summary>
    /// The inbox preview line. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("preview_text")]
    public Optional<string?> PreviewText { get; set; }

    /// <summary>
    /// The HTML part. `null` removes it, if `text` remains.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("html")]
    public Optional<string?> Html { get; set; }

    /// <summary>
    /// The plain text part. `null` removes it, if `html` remains.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("text")]
    public Optional<string?> Text { get; set; }

    /// <summary>
    /// Which opens and clicks are tracked.
    /// </summary>
    [Optional]
    [JsonPropertyName("tracking")]
    public UpdateBroadcastRequestTracking? Tracking { get; set; }

    /// <summary>
    /// Recipients per second. `null`: the plan's marketing rate.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("rate_per_second")]
    public Optional<int?> RatePerSecond { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
