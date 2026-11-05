using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record PreferenceLinks : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required PreferenceLinksObject Object { get; set; }

    /// <summary>
    /// The contact's id.
    /// </summary>
    [JsonPropertyName("contact_id")]
    public required string ContactId { get; set; }

    /// <summary>
    /// The contact's preference center.
    /// </summary>
    [JsonPropertyName("preferences_url")]
    public required string PreferencesUrl { get; set; }

    /// <summary>
    /// A one-button unsubscribe page.
    /// </summary>
    [JsonPropertyName("unsubscribe_url")]
    public required string UnsubscribeUrl { get; set; }

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
