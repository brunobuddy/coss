using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Only for `email.suppressed` without `suppression`: the recipient is a contact who unsubscribed (from marketing, or from the email's topic, `topic`).
/// </summary>
[Serializable]
public record EmailEventDataUnsubscribe : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The contact who unsubscribed. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("contact_id")]
    public string? ContactId { get; set; }

    /// <summary>
    /// The topic they left. `null`: marketing altogether.
    /// </summary>
    [Nullable]
    [JsonPropertyName("topic")]
    public string? Topic { get; set; }

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
