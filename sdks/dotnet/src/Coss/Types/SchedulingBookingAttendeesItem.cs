using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

[Serializable]
public record SchedulingBookingAttendeesItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// `attendee` booked it and comes first; a `guest` was added by them.
    /// </summary>
    [JsonPropertyName("role")]
    public required SchedulingBookingAttendeesItemRole Role { get; set; }

    /// <summary>
    /// Your own id for this person. `null` when none was given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("uid")]
    public string? Uid { get; set; }

    /// <summary>
    /// `null` when not given, or after their details are erased.
    /// </summary>
    [Nullable]
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// `null` when not given, or after their details are erased.
    /// </summary>
    [Nullable]
    [JsonPropertyName("email")]
    public string? Email { get; set; }

    /// <summary>
    /// `null` when not given, or after their details are erased.
    /// </summary>
    [Nullable]
    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    /// <summary>
    /// Their IANA time zone.
    /// </summary>
    [JsonPropertyName("time_zone")]
    public required string TimeZone { get; set; }

    /// <summary>
    /// Their locale. `null` when not given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("locale")]
    public string? Locale { get; set; }

    /// <summary>
    /// Only when retrieving one booking.
    /// </summary>
    [Optional]
    [JsonPropertyName("answers")]
    public Dictionary<string, OneOf<string, IEnumerable<string>>>? Answers { get; set; }

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
