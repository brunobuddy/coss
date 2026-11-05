using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingBookingNotification : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingBookingNotificationObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// `reminder` for an entry of `reminders`; otherwise a standard notification, or `started`/`ended`.
    /// </summary>
    [JsonPropertyName("kind")]
    public required string Kind { get; set; }

    [Nullable]
    [JsonPropertyName("reminder_key")]
    public string? ReminderKey { get; set; }

    [JsonPropertyName("channel")]
    public required SchedulingBookingNotificationChannel Channel { get; set; }

    [JsonPropertyName("recipient")]
    public required SchedulingBookingNotificationRecipient Recipient { get; set; }

    [JsonPropertyName("due_at")]
    public required string DueAt { get; set; }

    [Nullable]
    [JsonPropertyName("finished_at")]
    public string? FinishedAt { get; set; }

    /// <summary>
    /// `null` while it's waiting. `sent`, or why not: `too_late`, `filtered`, `no_show`, `no_address`, `no_sender`, `stale`, `superseded`, `failed`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("outcome")]
    public string? Outcome { get; set; }

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
