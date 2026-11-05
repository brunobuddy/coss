using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// A number sends skip.
/// </summary>
[Serializable]
public record SmsSuppressionCheckSuppression : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SmsSuppressionCheckSuppressionObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The suppressed number, in E.164.
    /// </summary>
    [JsonPropertyName("phone_number")]
    public required string PhoneNumber { get; set; }

    /// <summary>
    /// `opt_out`: the number replied STOP (or the carrier says it opted out). `invalid_number`: not a number that can receive SMS. `manual`: added by you.
    /// </summary>
    [JsonPropertyName("reason")]
    public required SmsSuppressionCheckSuppressionReason Reason { get; set; }

    /// <summary>
    /// The message whose failure added it, if any.
    /// </summary>
    [Nullable]
    [JsonPropertyName("sms_id")]
    public string? SmsId { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

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
