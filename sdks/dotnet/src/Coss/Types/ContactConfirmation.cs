using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record ContactConfirmation : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required ContactConfirmationObject Object { get; set; }

    /// <summary>
    /// The contact's id.
    /// </summary>
    [JsonPropertyName("contact_id")]
    public required string ContactId { get; set; }

    /// <summary>
    /// `sent`; `cooldown` (one confirmation per contact per day); `limit_reached` (three were sent and none confirmed); `not_pending` (the contact isn't waiting to confirm).
    /// </summary>
    [JsonPropertyName("status")]
    public required ContactConfirmationStatus Status { get; set; }

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
