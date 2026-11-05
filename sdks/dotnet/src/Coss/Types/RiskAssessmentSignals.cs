using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// What the assessment saw, by group. A group is `null` when it had nothing to go on.
/// </summary>
[Serializable]
public record RiskAssessmentSignals : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// What the address says. `null`: no email was given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("email")]
    public RiskEmailSignals? Email { get; set; }

    /// <summary>
    /// What the IP address says. `null`: none was given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("ip")]
    public RiskIpSignals? Ip { get; set; }

    /// <summary>
    /// `null` when velocity was unavailable (see `degraded`).
    /// </summary>
    [Nullable]
    [JsonPropertyName("velocity")]
    public Dictionary<string, long>? Velocity { get; set; }

    /// <summary>
    /// How the captcha went. `null`: no captcha applied.
    /// </summary>
    [Nullable]
    [JsonPropertyName("captcha")]
    public RiskCaptchaSignals? Captcha { get; set; }

    /// <summary>
    /// Whether a login is new for this user. `null`: not a login of a user with history.
    /// </summary>
    [Nullable]
    [JsonPropertyName("login")]
    public RiskLoginSignals? Login { get; set; }

    /// <summary>
    /// `null` when no content was given or it couldn't be classified.
    /// </summary>
    [Nullable]
    [JsonPropertyName("content")]
    public RiskContentSignals? Content { get; set; }

    /// <summary>
    /// What you sent in `checkout`. `null`: not given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("checkout")]
    public RiskCheckoutSignals? Checkout { get; set; }

    /// <summary>
    /// What the device token said. `null`: none was given.
    /// </summary>
    [Nullable]
    [JsonPropertyName("device")]
    public RiskDeviceSignals? Device { get; set; }

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
