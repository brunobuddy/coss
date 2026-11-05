using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingCalendarConnection : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingCalendarConnectionObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The id of the host it belongs to.
    /// </summary>
    [JsonPropertyName("host")]
    public required string Host { get; set; }

    /// <summary>
    /// Where the calendar lives. `simulated` exists only in sandbox environments; `zoom` is only used for meetings, never read for busy times.
    /// </summary>
    [JsonPropertyName("provider")]
    public required SchedulingCalendarConnectionProvider Provider { get; set; }

    /// <summary>
    /// The provider's account, such as the Google address.
    /// </summary>
    [JsonPropertyName("account")]
    public required string Account { get; set; }

    /// <summary>
    /// `needs_reauth`: access was lost, and this host isn't offered until it's back.
    /// </summary>
    [JsonPropertyName("status")]
    public required SchedulingCalendarConnectionStatus Status { get; set; }

    /// <summary>
    /// The calendar delegation that manages this connection. It can't be disconnected or reconnected by itself.
    /// </summary>
    [Nullable]
    [JsonPropertyName("delegation")]
    public string? Delegation { get; set; }

    /// <summary>
    /// The account's calendars.
    /// </summary>
    [JsonPropertyName("calendars")]
    public IEnumerable<SchedulingCalendarConnectionCalendarsItem> Calendars { get; set; } =
        new List<SchedulingCalendarConnectionCalendarsItem>();

    [JsonPropertyName("created_at")]
    public required string CreatedAt { get; set; }

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
