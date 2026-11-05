using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingCalendarConnectionCalendarsItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The calendar's id at the provider.
    /// </summary>
    [JsonPropertyName("external_id")]
    public required string ExternalId { get; set; }

    /// <summary>
    /// Whether its busy times block slots.
    /// </summary>
    [JsonPropertyName("read_busy")]
    public required bool ReadBusy { get; set; }

    /// <summary>
    /// Whether bookings are written to it.
    /// </summary>
    [JsonPropertyName("write_target")]
    public required bool WriteTarget { get; set; }

    /// <summary>
    /// When it was last read successfully. `null`: not read yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("verified_at")]
    public string? VerifiedAt { get; set; }

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
