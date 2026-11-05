using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record RiskReason : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The reason's code, listed under Risk's reasons in the docs.
    /// </summary>
    [JsonPropertyName("code")]
    public required RiskReasonCode Code { get; set; }

    /// <summary>
    /// What it means, in words. May change.
    /// </summary>
    [JsonPropertyName("message")]
    public required string Message { get; set; }

    /// <summary>
    /// The count behind a `velocity.*` reason, or the score behind a `content.*` one.
    /// </summary>
    [Optional]
    [JsonPropertyName("value")]
    public double? Value { get; set; }

    /// <summary>
    /// What a `velocity.*` or `content.*` reason fires at.
    /// </summary>
    [Optional]
    [JsonPropertyName("threshold")]
    public double? Threshold { get; set; }

    /// <summary>
    /// `velocity.*`: the window it's counted over.
    /// </summary>
    [Optional]
    [JsonPropertyName("window")]
    public RiskReasonWindow? Window { get; set; }

    /// <summary>
    /// `email.typo`: the likely domain.
    /// </summary>
    [Optional]
    [JsonPropertyName("suggestion")]
    public string? Suggestion { get; set; }

    /// <summary>
    /// `ip.hosting_provider`, `ip.vpn_network`: the network's operator; `ip.vpn`: the VPN service.
    /// </summary>
    [Optional]
    [JsonPropertyName("provider")]
    public string? Provider { get; set; }

    /// <summary>
    /// `duplicate.canonical_mailbox`, `duplicate.device`: your id of the user who has the mailbox or device, if known.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("previous_user")]
    public Optional<string?> PreviousUser { get; set; }

    /// <summary>
    /// `duplicate.canonical_mailbox`, `duplicate.device`: the assessment that first saw the mailbox or device.
    /// </summary>
    [Optional]
    [JsonPropertyName("previous_assessment")]
    public string? PreviousAssessment { get; set; }

    /// <summary>
    /// `list.*`: the matching list entry.
    /// </summary>
    [Optional]
    [JsonPropertyName("entry")]
    public string? Entry { get; set; }

    /// <summary>
    /// `rule.matched`: the rule's id.
    /// </summary>
    [Optional]
    [JsonPropertyName("rule")]
    public string? Rule { get; set; }

    /// <summary>
    /// `rule.matched`: the rule's name.
    /// </summary>
    [Optional]
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// `list.*`: what matched.
    /// </summary>
    [Optional]
    [JsonPropertyName("type")]
    public RiskReasonType? Type { get; set; }

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
