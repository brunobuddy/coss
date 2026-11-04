using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record ContactTopicsTopicsItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The topic's key.
    /// </summary>
    [JsonPropertyName("topic")]
    public required string Topic { get; set; }

    /// <summary>
    /// The topic's name.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Whether emails about the topic reach the contact (its choice, else the topic's default; an unsubscribed contact gets no marketing email at all).
    /// </summary>
    [JsonPropertyName("subscribed")]
    public required bool Subscribed { get; set; }

    /// <summary>
    /// The contact's explicit choice; `null`: the topic's default applies.
    /// </summary>
    [Nullable]
    [JsonPropertyName("choice")]
    public ContactTopicsTopicsItemChoice? Choice { get; set; }

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
