using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record InboxThreadSummary : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required InboxThreadSummaryObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The inbox's id.
    /// </summary>
    [JsonPropertyName("inbox_id")]
    public required string InboxId { get; set; }

    /// <summary>
    /// The first message's subject.
    /// </summary>
    [Nullable]
    [JsonPropertyName("subject")]
    public string? Subject { get; set; }

    /// <summary>
    /// Addresses of everyone in the conversation but the inbox (Bcc'd ones never).
    /// </summary>
    [JsonPropertyName("participants")]
    public IEnumerable<string> Participants { get; set; } = new List<string>();

    /// <summary>
    /// Messages in the thread.
    /// </summary>
    [JsonPropertyName("message_count")]
    public required long MessageCount { get; set; }

    /// <summary>
    /// The start of the latest message.
    /// </summary>
    [Nullable]
    [JsonPropertyName("preview")]
    public string? Preview { get; set; }

    /// <summary>
    /// When its latest message was received or sent.
    /// </summary>
    [JsonPropertyName("last_message_at")]
    public required DateTime LastMessageAt { get; set; }

    /// <summary>
    /// When its latest inbound message arrived: later than `last_message_at`'s outbound one means the conversation awaits a reply.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last_inbound_at")]
    public DateTime? LastInboundAt { get; set; }

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
