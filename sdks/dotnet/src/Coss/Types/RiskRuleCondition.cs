using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

/// <summary>
/// A test of one field. A field without a value (no IP, no email…) never matches, whatever the operator.
/// </summary>
[Serializable]
public record RiskRuleCondition : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The signal to test, such as `email.disposable` or `ip.country`.
    /// </summary>
    [JsonPropertyName("field")]
    public required RiskRuleConditionField Field { get; set; }

    /// <summary>
    /// How to compare. Booleans use `is`, numbers `eq` to `lte`, and strings `eq`, `neq`, `in` and `not_in`.
    /// </summary>
    [JsonPropertyName("operator")]
    public required RiskRuleConditionOperator Operator { get; set; }

    /// <summary>
    /// What to compare it with: its type follows the field, and `in` and `not_in` take a list of strings.
    /// </summary>
    [JsonPropertyName("value")]
    public required OneOf<bool, double, string, IEnumerable<string>> Value { get; set; }

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
