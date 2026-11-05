using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// `scheduling.booking.reminder`: which reminder this is.
/// </summary>
[Serializable]
public record SchedulingBookingWebhookDataReminder : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Which reminder this is.
    /// </summary>
    [JsonPropertyName("key")]
    public required string Key { get; set; }

    /// <summary>
    /// The moment it's timed from.
    /// </summary>
    [JsonPropertyName("anchor")]
    public required SchedulingBookingWebhookDataReminderAnchor Anchor { get; set; }

    /// <summary>
    /// How long before the anchor. `null` when it's after.
    /// </summary>
    [Nullable]
    [JsonPropertyName("before_minutes")]
    public double? BeforeMinutes { get; set; }

    /// <summary>
    /// How long after the anchor. `null` when it's before.
    /// </summary>
    [Nullable]
    [JsonPropertyName("after_minutes")]
    public double? AfterMinutes { get; set; }

    /// <summary>
    /// When it was due.
    /// </summary>
    [JsonPropertyName("scheduled_for")]
    public required string ScheduledFor { get; set; }

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
