using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

[Serializable]
public record SchedulingHost : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingHostObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// Your own id for this host, unique in the environment, accepted wherever a host id is. `null` when none is set.
    /// </summary>
    [Nullable]
    [JsonPropertyName("uid")]
    public string? Uid { get; set; }

    /// <summary>
    /// The host's name.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Where this host's notifications go. `null` when none is set. Not an identity, and need not be unique.
    /// </summary>
    [Nullable]
    [JsonPropertyName("email")]
    public string? Email { get; set; }

    /// <summary>
    /// Where this host's SMS reminders go, in E.164. `null` when none is set.
    /// </summary>
    [Nullable]
    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    /// <summary>
    /// The mailbox a calendar delegation connects for this host, when it isn't `email`. `null` when none is set.
    /// </summary>
    [Nullable]
    [JsonPropertyName("calendar_account")]
    public string? CalendarAccount { get; set; }

    /// <summary>
    /// The host's IANA time zone. Their schedules default to it, and limits count days and weeks in it.
    /// </summary>
    [JsonPropertyName("time_zone")]
    public required string TimeZone { get; set; }

    /// <summary>
    /// What this host's notifications are written in. `null`: English.
    /// </summary>
    [Nullable]
    [JsonPropertyName("locale")]
    public string? Locale { get; set; }

    /// <summary>
    /// What pools filter hosts by, as strings or lists of strings.
    /// </summary>
    [JsonPropertyName("attributes")]
    public Dictionary<string, OneOf<string, IEnumerable<string>>> Attributes { get; set; } =
        new Dictionary<string, OneOf<string, IEnumerable<string>>>();

    /// <summary>
    /// This host's own office, meeting link and phone number. An event type's location that leaves its value blank uses them.
    /// </summary>
    [JsonPropertyName("locations")]
    public IEnumerable<SchedulingHostLocation> Locations { get; set; } =
        new List<SchedulingHostLocation>();

    /// <summary>
    /// Your own key-value pairs.
    /// </summary>
    [JsonPropertyName("metadata")]
    public Dictionary<string, string> Metadata { get; set; } = new Dictionary<string, string>();

    /// <summary>
    /// `active`: can be offered. `disabled`: isn't offered, and keeps its existing bookings.
    /// </summary>
    [JsonPropertyName("status")]
    public required SchedulingHostStatus Status { get; set; }

    [JsonPropertyName("created_at")]
    public required string CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required string UpdatedAt { get; set; }

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
