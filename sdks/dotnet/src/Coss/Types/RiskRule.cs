using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record RiskRule : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required RiskRuleObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// Your name for the rule, returned with reasons when it decides.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// `false`: it's kept, and no assessment applies it.
    /// </summary>
    [JsonPropertyName("enabled")]
    public required bool Enabled { get; set; }

    /// <summary>
    /// Rules are tried in ascending order.
    /// </summary>
    [JsonPropertyName("position")]
    public required long Position { get; set; }

    /// <summary>
    /// Events it applies to; empty: every event.
    /// </summary>
    [JsonPropertyName("events")]
    public IEnumerable<RiskEvent> Events { get; set; } = new List<RiskEvent>();

    /// <summary>
    /// `all`: every condition must hold. `any`: one is enough.
    /// </summary>
    [JsonPropertyName("match")]
    public required RiskRuleMatch Match { get; set; }

    /// <summary>
    /// What must hold, by `match`.
    /// </summary>
    [JsonPropertyName("conditions")]
    public IEnumerable<RiskRuleCondition> Conditions { get; set; } = new List<RiskRuleCondition>();

    [JsonPropertyName("action")]
    public required RiskDecision Action { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required DateTime UpdatedAt { get; set; }

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
