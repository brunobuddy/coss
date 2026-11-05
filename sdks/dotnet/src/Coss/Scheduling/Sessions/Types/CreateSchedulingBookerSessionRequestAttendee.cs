using Coss;
using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

/// <summary>
/// Who's booking, if you already know: the browser then can't change it.
/// </summary>
[Serializable]
public record CreateSchedulingBookerSessionRequestAttendee : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Your own id for this person, used to erase their data later.
    /// </summary>
    [Optional]
    [JsonPropertyName("uid")]
    public string? Uid { get; set; }

    /// <summary>
    /// Needed for coss.com to notify them. Can't contain a link.
    /// </summary>
    [Optional]
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// Where coss.com emails them, if it does.
    /// </summary>
    [Optional]
    [JsonPropertyName("email")]
    public string? Email { get; set; }

    /// <summary>
    /// An E.164 number, for SMS reminders.
    /// </summary>
    [Optional]
    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    /// <summary>
    /// Their IANA time zone. A series keeps their local time across clock changes.
    /// </summary>
    [JsonPropertyName("time_zone")]
    public required string TimeZone { get; set; }

    /// <summary>
    /// Their locale, such as `en-US`. Emails and texts about the booking are written in it when coss.com has it, otherwise in English, and guests get the same.
    /// </summary>
    [Optional]
    [JsonPropertyName("locale")]
    public string? Locale { get; set; }

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
