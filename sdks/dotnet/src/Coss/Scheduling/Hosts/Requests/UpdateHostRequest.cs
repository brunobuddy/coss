using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Scheduling;

[Serializable]
public record UpdateHostRequest
{
    /// <summary>
    /// The host's id or uid.
    /// </summary>
    [JsonIgnore]
    public required string Host { get; set; }

    /// <summary>
    /// Your own id for this host, unique in the environment.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("uid")]
    public Optional<string?> Uid { get; set; }

    /// <summary>
    /// The host's name.
    /// </summary>
    [Optional]
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// Where this host's notifications go. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("email")]
    public Optional<string?> Email { get; set; }

    /// <summary>
    /// Where this host's SMS reminders go, in E.164. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("phone")]
    public Optional<string?> Phone { get; set; }

    /// <summary>
    /// Moves the host's delegated calendar to this mailbox. Refused while they have upcoming bookings or holds.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("calendar_account")]
    public Optional<string?> CalendarAccount { get; set; }

    /// <summary>
    /// An IANA time zone name.
    /// </summary>
    [Optional]
    [JsonPropertyName("time_zone")]
    public string? TimeZone { get; set; }

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
    /// Replaces this host's own locations. Existing bookings keep the location they have.
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

    /// <summary>
    /// A `disabled` host isn't offered. Its existing bookings stay.
    /// </summary>
    [Optional]
    [JsonPropertyName("status")]
    public UpdateHostRequestStatus? Status { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
