using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record ReceivedSmsWebhookEventData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The received message; `null` for an opt-out to a number whose replies go to no environment.
    /// </summary>
    [Nullable]
    [JsonPropertyName("received_sms_id")]
    public string? ReceivedSmsId { get; set; }

    /// <summary>
    /// Who sent it.
    /// </summary>
    [JsonPropertyName("from")]
    public required string From { get; set; }

    /// <summary>
    /// Your number that received it.
    /// </summary>
    [JsonPropertyName("to")]
    public required string To { get; set; }

    /// <summary>
    /// The keyword it is, if any: `stop`, `start` or `help`. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("keyword")]
    public ReceivedSmsWebhookEventDataKeyword? Keyword { get; set; }

    /// <summary>
    /// Whether it's a simulated message of a sandbox environment.
    /// </summary>
    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

    /// <summary>
    /// When it happened.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

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
