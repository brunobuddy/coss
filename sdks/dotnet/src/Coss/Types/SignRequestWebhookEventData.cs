using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// The request. Never documents or field values.
/// </summary>
[Serializable]
public record SignRequestWebhookEventData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The signature request's id.
    /// </summary>
    [JsonPropertyName("sign_request_id")]
    public required string SignRequestId { get; set; }

    /// <summary>
    /// The request's status after the event.
    /// </summary>
    [JsonPropertyName("status")]
    public required SignRequestWebhookEventDataStatus Status { get; set; }

    /// <summary>
    /// The request's title.
    /// </summary>
    [JsonPropertyName("title")]
    public required string Title { get; set; }

    /// <summary>
    /// Your own key-value pairs.
    /// </summary>
    [JsonPropertyName("metadata")]
    public Dictionary<string, string> Metadata { get; set; } = new Dictionary<string, string>();

    /// <summary>
    /// The signer who viewed, signed or declined; `null` otherwise.
    /// </summary>
    [Nullable]
    [JsonPropertyName("signer")]
    public SignRequestWebhookEventDataSigner? Signer { get; set; }

    /// <summary>
    /// A decline's reason, if the signer gave one.
    /// </summary>
    [Nullable]
    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    /// <summary>
    /// Whether it belongs to a sandbox environment.
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
