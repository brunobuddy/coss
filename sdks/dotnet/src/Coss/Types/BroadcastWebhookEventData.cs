using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The broadcast and how it fared.
/// </summary>
[Serializable]
public record BroadcastWebhookEventData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("broadcast")]
    public required BroadcastWebhookEventDataBroadcast Broadcast { get; set; }

    /// <summary>
    /// Why a paused broadcast waits. `null`: it isn't paused.
    /// </summary>
    [Nullable]
    [JsonPropertyName("pause_reason")]
    public string? PauseReason { get; set; }

    /// <summary>
    /// Why it failed. `null`: it didn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("error")]
    public BroadcastWebhookEventDataError? Error { get; set; }

    [JsonPropertyName("stats")]
    public required BroadcastStats Stats { get; set; }

    /// <summary>
    /// When this happened.
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
