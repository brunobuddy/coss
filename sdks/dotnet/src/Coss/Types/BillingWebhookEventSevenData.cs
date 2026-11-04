using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record BillingWebhookEventSevenData : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The organization's id.
    /// </summary>
    [JsonPropertyName("organization_id")]
    public required string OrganizationId { get; set; }

    /// <summary>
    /// When it happened: sort events by it.
    /// </summary>
    [JsonPropertyName("occurred_at")]
    public required DateTime OccurredAt { get; set; }

    /// <summary>
    /// What the budget is for: a member's personal API keys (`user`), a project or an API key.
    /// </summary>
    [JsonPropertyName("scope")]
    public required BillingWebhookEventSevenDataScope Scope { get; set; }

    /// <summary>
    /// The user, project or API key id.
    /// </summary>
    [JsonPropertyName("target_id")]
    public required string TargetId { get; set; }

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
