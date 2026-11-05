using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Scheduling;

[Serializable]
public record CreateHostRequest
{
    /// <summary>
    /// Your own id for this host, unique in the environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("uid")]
    public string? Uid { get; set; }

    /// <summary>
    /// The host's name.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Where this host's notifications go. Not an identity, and need not be unique.
    /// </summary>
    [Optional]
    [JsonPropertyName("email")]
    public string? Email { get; set; }

    /// <summary>
    /// Where this host's SMS reminders go, in E.164.
    /// </summary>
    [Optional]
    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    /// <summary>
    /// The mailbox a calendar delegation connects for this host, when it isn't `email` or the delegation doesn't match on email. In Microsoft 365, their user principal name.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("calendar_account")]
    public Optional<string?> CalendarAccount { get; set; }

    /// <summary>
    /// An IANA time zone name.
    /// </summary>
    [JsonPropertyName("time_zone")]
    public required string TimeZone { get; set; }

    /// <summary>
    /// What this host's notifications are written in, such as `de`. Default: English. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("locale")]
    public Optional<string?> Locale { get; set; }

    /// <summary>
    /// What pools filter hosts by, such as `{ "licensed_in": ["CA", "NY"], "language": "es" }`.
    /// </summary>
    [Optional]
    [JsonPropertyName("attributes")]
    public Dictionary<string, OneOf<string, IEnumerable<string>>>? Attributes { get; set; }

    /// <summary>
    /// This host's own office, meeting link and phone number. An event type's location that leaves its value blank uses them.
    /// </summary>
    [Optional]
    [JsonPropertyName("locations")]
    public IEnumerable<SchedulingHostLocation>? Locations { get; set; }

    /// <summary>
    /// Your own key-value pairs. Don't put sensitive data here.
    /// </summary>
    [Optional]
    [JsonPropertyName("metadata")]
    public Dictionary<string, string>? Metadata { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
