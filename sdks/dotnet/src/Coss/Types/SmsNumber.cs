using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record SmsNumber : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required SmsNumberObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The number, in E.164.
    /// </summary>
    [JsonPropertyName("phone_number")]
    public required string PhoneNumber { get; set; }

    /// <summary>
    /// `local` (US A2P 10DLC) or `toll_free` (toll-free verification, and sends only to the US and Canada).
    /// </summary>
    [JsonPropertyName("kind")]
    public required SmsNumberKind Kind { get; set; }

    /// <summary>
    /// Its country (ISO 3166-1 alpha-2).
    /// </summary>
    [JsonPropertyName("country")]
    public required string Country { get; set; }

    /// <summary>
    /// `pending`: not ready yet. `active`: ready, once its registration is approved. `releasing`: being given up.
    /// </summary>
    [JsonPropertyName("status")]
    public required SmsNumberStatus Status { get; set; }

    /// <summary>
    /// Its carrier registration's status; live sends need `approved`.
    /// </summary>
    [Nullable]
    [JsonPropertyName("registration_status")]
    public SmsNumberRegistrationStatus? RegistrationStatus { get; set; }

    /// <summary>
    /// Whether live sends can go from it now.
    /// </summary>
    [JsonPropertyName("can_send")]
    public required bool CanSend { get; set; }

    /// <summary>
    /// Whether replies to it arrive in the environment of the key making the request.
    /// </summary>
    [JsonPropertyName("receives_here")]
    public required bool ReceivesHere { get; set; }

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
