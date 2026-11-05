using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Only for `email.suppressed`: the entry that matched the recipient.
/// </summary>
[Serializable]
public record EmailWebhookEventDataSuppression : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The suppression's id.
    /// </summary>
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// What it covers: every email, every marketing email, or one category.
    /// </summary>
    [JsonPropertyName("scope")]
    public required string Scope { get; set; }

    /// <summary>
    /// `bounce`: added after a permanent bounce. `complaint`: added after a spam complaint. `manual`: added one by one through the API or dashboard. `import`: added by a bulk import. `unsubscribe`: added by the recipient's one-click unsubscribe, scoped to the email's category.
    /// </summary>
    [JsonPropertyName("reason")]
    public required EmailWebhookEventDataSuppressionReason Reason { get; set; }

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
