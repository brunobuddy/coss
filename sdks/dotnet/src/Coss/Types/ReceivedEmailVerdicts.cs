using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// What the receiving server concluded: `pass`, `fail`, `gray` (could not decide) or `processing_failed`; `null` when the check did not run.
/// </summary>
[Serializable]
public record ReceivedEmailVerdicts : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The spam verdict.
    /// </summary>
    [Nullable]
    [JsonPropertyName("spam")]
    public ReceivedEmailVerdictsSpam? Spam { get; set; }

    /// <summary>
    /// The virus verdict.
    /// </summary>
    [Nullable]
    [JsonPropertyName("virus")]
    public ReceivedEmailVerdictsVirus? Virus { get; set; }

    /// <summary>
    /// The SPF verdict.
    /// </summary>
    [Nullable]
    [JsonPropertyName("spf")]
    public ReceivedEmailVerdictsSpf? Spf { get; set; }

    /// <summary>
    /// The DKIM verdict.
    /// </summary>
    [Nullable]
    [JsonPropertyName("dkim")]
    public ReceivedEmailVerdictsDkim? Dkim { get; set; }

    /// <summary>
    /// The DMARC verdict.
    /// </summary>
    [Nullable]
    [JsonPropertyName("dmarc")]
    public ReceivedEmailVerdictsDmarc? Dmarc { get; set; }

    /// <summary>
    /// The sender domain's DMARC policy (`none`, `quarantine` or `reject`) when DMARC failed.
    /// </summary>
    [Nullable]
    [JsonPropertyName("dmarc_policy")]
    public string? DmarcPolicy { get; set; }

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
