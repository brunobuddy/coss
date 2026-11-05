using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Risk;

[Serializable]
public record CreateRiskRuleRequest
{
    /// <summary>
    /// Your name for the rule, returned with reasons when it decides.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Default `true`.
    /// </summary>
    [Optional]
    [JsonPropertyName("enabled")]
    public bool? Enabled { get; set; }

    /// <summary>
    /// Default 0.
    /// </summary>
    [Optional]
    [JsonPropertyName("position")]
    public int? Position { get; set; }

    /// <summary>
    /// Events it applies to. Default: every event.
    /// </summary>
    [Optional]
    [JsonPropertyName("events")]
    public IEnumerable<RiskEvent>? Events { get; set; }

    /// <summary>
    /// Default `all`.
    /// </summary>
    [Optional]
    [JsonPropertyName("match")]
    public CreateRiskRuleRequestMatch? Match { get; set; }

    /// <summary>
    /// What must hold, by `match`.
    /// </summary>
    [JsonPropertyName("conditions")]
    public IEnumerable<RiskRuleCondition> Conditions { get; set; } = new List<RiskRuleCondition>();

    [JsonPropertyName("action")]
    public required RiskDecision Action { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
