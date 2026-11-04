using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SmsSuppressionCheck : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SmsSuppressionCheckObject Object { get; set; }

    /// <summary>
    /// The number checked, in E.164.
    /// </summary>
    [JsonPropertyName("phone_number")]
    public required string PhoneNumber { get; set; }

    /// <summary>
    /// Whether a send to this number would be skipped.
    /// </summary>
    [JsonPropertyName("suppressed")]
    public required bool Suppressed { get; set; }

    /// <summary>
    /// A number sends skip.
    /// </summary>
    [Nullable]
    [JsonPropertyName("suppression")]
    public SmsSuppressionCheckSuppression? Suppression { get; set; }

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
