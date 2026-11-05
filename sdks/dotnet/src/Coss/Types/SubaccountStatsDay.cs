using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SubaccountStatsDay : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The UTC date.
    /// </summary>
    [JsonPropertyName("date")]
    public required DateOnly Date { get; set; }

    /// <summary>
    /// Recipients of the emails sent that day.
    /// </summary>
    [JsonPropertyName("recipients")]
    public required long Recipients { get; set; }

    /// <summary>
    /// Handed to the provider (delivered or not).
    /// </summary>
    [JsonPropertyName("sent")]
    public required long Sent { get; set; }

    /// <summary>
    /// Deliveries that day.
    /// </summary>
    [JsonPropertyName("delivered")]
    public required long Delivered { get; set; }

    /// <summary>
    /// Bounces that day.
    /// </summary>
    [JsonPropertyName("bounced")]
    public required long Bounced { get; set; }

    /// <summary>
    /// Complaints that day.
    /// </summary>
    [JsonPropertyName("complained")]
    public required long Complained { get; set; }

    /// <summary>
    /// Failures that day.
    /// </summary>
    [JsonPropertyName("failed")]
    public required long Failed { get; set; }

    /// <summary>
    /// Skipped: on a suppression list.
    /// </summary>
    [JsonPropertyName("suppressed")]
    public required long Suppressed { get; set; }

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
