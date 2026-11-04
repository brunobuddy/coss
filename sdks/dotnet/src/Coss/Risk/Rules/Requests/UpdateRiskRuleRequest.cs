using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Risk;

[Serializable]
public record UpdateRiskRuleRequest
{
    /// <summary>
    /// The rule's id.
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    /// <summary>
    /// Your name for the rule.
    /// </summary>
    [Optional]
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// `false` keeps it, and stops applying it.
    /// </summary>
    [Optional]
    [JsonPropertyName("enabled")]
    public bool? Enabled { get; set; }

    /// <summary>
    /// Rules are tried in ascending order.
    /// </summary>
    [Optional]
    [JsonPropertyName("position")]
    public int? Position { get; set; }

    /// <summary>
    /// Events it applies to. Empty: every event.
    /// </summary>
    [Optional]
    [JsonPropertyName("events")]
    public IEnumerable<RiskEvent>? Events { get; set; }

    /// <summary>
    /// `all`: every condition must hold. `any`: one is enough.
    /// </summary>
    [Optional]
    [JsonPropertyName("match")]
    public UpdateRiskRuleRequestMatch? Match { get; set; }

    /// <summary>
    /// What must hold, by `match`.
    /// </summary>
    [Optional]
    [JsonPropertyName("conditions")]
    public IEnumerable<RiskRuleCondition>? Conditions { get; set; }

    [Optional]
    [JsonPropertyName("action")]
    public RiskDecision? Action { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
