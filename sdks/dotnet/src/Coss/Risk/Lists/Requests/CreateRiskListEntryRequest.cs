using Coss;
using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Risk;

[Serializable]
public record CreateRiskListEntryRequest
{
    [JsonPropertyName("list")]
    public required RiskList List { get; set; }

    [JsonPropertyName("type")]
    public required RiskListEntryType Type { get; set; }

    /// <summary>
    /// What to match: the address, domain, IP, CIDR range, ASN or other value of its `type`.
    /// </summary>
    [JsonPropertyName("value")]
    public required string Value { get; set; }

    /// <summary>
    /// Your note about it.
    /// </summary>
    [Optional]
    [JsonPropertyName("note")]
    public string? Note { get; set; }

    /// <summary>
    /// The entry stops matching at this time (it is kept until deleted).
    /// </summary>
    [Optional]
    [JsonPropertyName("expires_at")]
    public DateTime? ExpiresAt { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
