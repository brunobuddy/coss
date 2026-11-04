using Coss;
using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record UpdateSchedulingSettingsRequestNotificationsValue : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Email the attendee about this event.
    /// </summary>
    [Optional]
    [JsonPropertyName("email_attendee")]
    public bool? EmailAttendee { get; set; }

    /// <summary>
    /// Email the host about this event.
    /// </summary>
    [Optional]
    [JsonPropertyName("email_host")]
    public bool? EmailHost { get; set; }

    /// <summary>
    /// Text the attendee about this event, if `sms_from` is set.
    /// </summary>
    [Optional]
    [JsonPropertyName("sms_attendee")]
    public bool? SmsAttendee { get; set; }

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
