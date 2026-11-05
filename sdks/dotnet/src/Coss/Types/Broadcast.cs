using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record Broadcast : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required BroadcastObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// Shown only to you.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// `draft` (editable), `scheduled`, `sending`, `paused` (see `pause_reason`), `sent`, `canceled`, or `failed` (see `error`).
    /// </summary>
    [JsonPropertyName("status")]
    public required BroadcastStatus Status { get; set; }

    /// <summary>
    /// The audience it goes to. `null`: a segment.
    /// </summary>
    [Nullable]
    [JsonPropertyName("audience_id")]
    public string? AudienceId { get; set; }

    /// <summary>
    /// The segment it goes to. `null`: an audience.
    /// </summary>
    [Nullable]
    [JsonPropertyName("segment_id")]
    public string? SegmentId { get; set; }

    /// <summary>
    /// The topic it's about (its key), and its emails' `category`. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("topic")]
    public string? Topic { get; set; }

    /// <summary>
    /// Who it's sent from.
    /// </summary>
    [JsonPropertyName("from")]
    public required string From { get; set; }

    /// <summary>
    /// Addresses replies go to.
    /// </summary>
    [JsonPropertyName("reply_to")]
    public IEnumerable<string> ReplyTo { get; set; } = new List<string>();

    /// <summary>
    /// The subject, before contact fields are filled in.
    /// </summary>
    [JsonPropertyName("subject")]
    public required string Subject { get; set; }

    /// <summary>
    /// The inbox preview line. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("preview_text")]
    public string? PreviewText { get; set; }

    /// <summary>
    /// The HTML part, before contact fields are filled in. `null`: text only.
    /// </summary>
    [Nullable]
    [JsonPropertyName("html")]
    public string? Html { get; set; }

    /// <summary>
    /// The plain text part. `null`: HTML only.
    /// </summary>
    [Nullable]
    [JsonPropertyName("text")]
    public string? Text { get; set; }

    /// <summary>
    /// Which opens and clicks are tracked.
    /// </summary>
    [JsonPropertyName("tracking")]
    public required BroadcastTracking Tracking { get; set; }

    /// <summary>
    /// Recipients per second. `null`: the plan's marketing rate.
    /// </summary>
    [Nullable]
    [JsonPropertyName("rate_per_second")]
    public long? RatePerSecond { get; set; }

    /// <summary>
    /// When it's set to start. `null`: not scheduled.
    /// </summary>
    [Nullable]
    [JsonPropertyName("scheduled_at")]
    public DateTime? ScheduledAt { get; set; }

    /// <summary>
    /// When sending started. `null`: it hasn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("started_at")]
    public DateTime? StartedAt { get; set; }

    /// <summary>
    /// When it finished. `null`: it hasn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("completed_at")]
    public DateTime? CompletedAt { get; set; }

    /// <summary>
    /// When it was canceled. `null`: it wasn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("canceled_at")]
    public DateTime? CanceledAt { get; set; }

    /// <summary>
    /// How many contacts it would reach, counted when it started.
    /// </summary>
    [Nullable]
    [JsonPropertyName("recipients_estimated")]
    public long? RecipientsEstimated { get; set; }

    /// <summary>
    /// Why a paused broadcast waits: `paused` (by you), `billing_hold`, `budget_exceeded`, `usage_limit`, `marketing_paused`, `account_suspended`, `sending_paused`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("pause_reason")]
    public string? PauseReason { get; set; }

    /// <summary>
    /// Why it `failed`, such as `target_unavailable` when its audience, segment or topic was deleted while sending. `null`: it didn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("error")]
    public BroadcastError? Error { get; set; }

    [JsonPropertyName("stats")]
    public required BroadcastStats Stats { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required DateTime UpdatedAt { get; set; }

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
