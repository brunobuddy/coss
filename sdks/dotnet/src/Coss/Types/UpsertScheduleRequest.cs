using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record UpsertScheduleRequest : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// A label for the schedule. Default on creation: `Default`.
    /// </summary>
    [Optional]
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// Default: the host's.
    /// </summary>
    [Optional]
    [JsonPropertyName("time_zone")]
    public string? TimeZone { get; set; }

    /// <summary>
    /// `true` makes this the host's default schedule, in place of the current one. A host's first schedule is their default anyway.
    /// </summary>
    [Optional]
    [JsonPropertyName("is_default")]
    public bool? IsDefault { get; set; }

    /// <summary>
    /// Weekly hours in local time. A range can't cross midnight: use two.
    /// </summary>
    [JsonPropertyName("rules")]
    public IEnumerable<SchedulingWeeklyRule> Rules { get; set; } = new List<SchedulingWeeklyRule>();

    /// <summary>
    /// Replaces the schedule's overrides when given.
    /// </summary>
    [Optional]
    [JsonPropertyName("overrides")]
    public IEnumerable<SchedulingScheduleOverride>? Overrides { get; set; }

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
