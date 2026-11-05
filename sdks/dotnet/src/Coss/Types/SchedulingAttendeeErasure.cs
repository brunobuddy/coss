using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SchedulingAttendeeErasure : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SchedulingAttendeeErasureObject Object { get; set; }

    /// <summary>
    /// The attendee's uid.
    /// </summary>
    [JsonPropertyName("uid")]
    public required string Uid { get; set; }

    /// <summary>
    /// How many attendee records were erased, one per booking.
    /// </summary>
    [JsonPropertyName("erased")]
    public required double Erased { get; set; }

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
