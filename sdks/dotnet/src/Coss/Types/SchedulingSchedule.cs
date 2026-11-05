using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingSchedule : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingScheduleObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The id of the host this schedule belongs to.
    /// </summary>
    [JsonPropertyName("host")]
    public required string Host { get; set; }

    /// <summary>
    /// A label for the schedule. `Default` when none was given.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// The IANA time zone its rules and overrides are local to.
    /// </summary>
    [JsonPropertyName("time_zone")]
    public required string TimeZone { get; set; }

    /// <summary>
    /// Whether this is the host's default schedule, used by event types that don't name one. A host's first schedule always is.
    /// </summary>
    [JsonPropertyName("is_default")]
    public required bool IsDefault { get; set; }

    /// <summary>
    /// Weekly hours in local time, unchanged across daylight saving.
    /// </summary>
    [JsonPropertyName("rules")]
    public IEnumerable<SchedulingScheduleRulesItem> Rules { get; set; } =
        new List<SchedulingScheduleRulesItem>();

    /// <summary>
    /// Dates whose hours replace the weekly rules.
    /// </summary>
    [JsonPropertyName("overrides")]
    public IEnumerable<SchedulingScheduleOverridesItem> Overrides { get; set; } =
        new List<SchedulingScheduleOverridesItem>();

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
