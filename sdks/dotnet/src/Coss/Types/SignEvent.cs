using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SignEvent : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SignEventObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// 1-based position in the request's trail.
    /// </summary>
    [JsonPropertyName("sequence")]
    public required long Sequence { get; set; }

    /// <summary>
    /// What happened. `created`, `sent`, `canceled` and `expired` concern the request; `notified`, `reminded`, `viewed`, `consented`, `signed` and `declined` a signer; `completed` is the last signature and `sealed` the sealed document being ready.
    /// </summary>
    [JsonPropertyName("type")]
    public required SignEventType Type { get; set; }

    /// <summary>
    /// The id of the signer it concerns. `null`: the whole request.
    /// </summary>
    [Nullable]
    [JsonPropertyName("signer_id")]
    public string? SignerId { get; set; }

    /// <summary>
    /// Who did it: your API key, a signer, a member in the dashboard, or coss.com.
    /// </summary>
    [JsonPropertyName("actor")]
    public required SignEventActor Actor { get; set; }

    /// <summary>
    /// The address the action came from. `null`: unknown, or coss.com acted.
    /// </summary>
    [Nullable]
    [JsonPropertyName("ip_address")]
    public string? IpAddress { get; set; }

    /// <summary>
    /// The client's `User-Agent`. `null`: unknown.
    /// </summary>
    [Nullable]
    [JsonPropertyName("user_agent")]
    public string? UserAgent { get; set; }

    /// <summary>
    /// What this event recorded, depending on its type.
    /// </summary>
    [JsonPropertyName("details")]
    public required SignEventDetails Details { get; set; }

    /// <summary>
    /// When it happened.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

    /// <summary>
    /// The previous event's `hash`. `null` on the first event.
    /// </summary>
    [Nullable]
    [JsonPropertyName("previous_hash")]
    public string? PreviousHash { get; set; }

    /// <summary>
    /// SHA-256 over this event and `previous_hash`: changing or removing an event breaks the chain from there on.
    /// </summary>
    [JsonPropertyName("hash")]
    public required string Hash { get; set; }

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
