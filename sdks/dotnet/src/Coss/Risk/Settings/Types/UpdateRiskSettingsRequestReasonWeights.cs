using Coss;
using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Risk;

/// <summary>
/// Changes the reasons given: a weight in [0, 0.99] replaces the default, `null` goes back to it.
/// </summary>
[Serializable]
public record UpdateRiskSettingsRequestReasonWeights : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("email.invalid")]
    public Optional<double?> EmailInvalid { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("email.disposable")]
    public Optional<double?> EmailDisposable { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("email.undeliverable")]
    public Optional<double?> EmailUndeliverable { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("email.role_account")]
    public Optional<double?> EmailRoleAccount { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("email.typo")]
    public Optional<double?> EmailTypo { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("email.domain_new")]
    public Optional<double?> EmailDomainNew { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("ip.tor")]
    public Optional<double?> IpTor { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("ip.vpn_network")]
    public Optional<double?> IpVpnNetwork { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("ip.hosting_provider")]
    public Optional<double?> IpHostingProvider { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("ip.vpn")]
    public Optional<double?> IpVpn { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("ip.proxy")]
    public Optional<double?> IpProxy { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("ip.relay")]
    public Optional<double?> IpRelay { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("ip.private")]
    public Optional<double?> IpPrivate { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.signups_per_ip_1h")]
    public Optional<double?> VelocitySignupsPerIp1H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.signups_per_ip_24h")]
    public Optional<double?> VelocitySignupsPerIp24H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.signups_per_subnet_1h")]
    public Optional<double?> VelocitySignupsPerSubnet1H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.signups_per_email_domain_1h")]
    public Optional<double?> VelocitySignupsPerEmailDomain1H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.signups_per_mailbox_24h")]
    public Optional<double?> VelocitySignupsPerMailbox24H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.signups_per_device_24h")]
    public Optional<double?> VelocitySignupsPerDevice24H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.checkouts_per_ip_1h")]
    public Optional<double?> VelocityCheckoutsPerIp1H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.checkouts_per_user_1h")]
    public Optional<double?> VelocityCheckoutsPerUser1H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.checkouts_per_card_24h")]
    public Optional<double?> VelocityCheckoutsPerCard24H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.logins_per_ip_1h")]
    public Optional<double?> VelocityLoginsPerIp1H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.logins_per_user_1h")]
    public Optional<double?> VelocityLoginsPerUser1H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.events_per_ip_1h")]
    public Optional<double?> VelocityEventsPerIp1H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("velocity.events_per_user_1h")]
    public Optional<double?> VelocityEventsPerUser1H { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("duplicate.canonical_mailbox")]
    public Optional<double?> DuplicateCanonicalMailbox { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("duplicate.device")]
    public Optional<double?> DuplicateDevice { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("history.fraud_mailbox")]
    public Optional<double?> HistoryFraudMailbox { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("history.fraud_user")]
    public Optional<double?> HistoryFraudUser { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("history.fraud_ip")]
    public Optional<double?> HistoryFraudIp { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("history.fraud_subnet")]
    public Optional<double?> HistoryFraudSubnet { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("history.fraud_card")]
    public Optional<double?> HistoryFraudCard { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("history.fraud_device")]
    public Optional<double?> HistoryFraudDevice { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("checkout.card_country_mismatch")]
    public Optional<double?> CheckoutCardCountryMismatch { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("checkout.billing_country_mismatch")]
    public Optional<double?> CheckoutBillingCountryMismatch { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("checkout.prepaid_card")]
    public Optional<double?> CheckoutPrepaidCard { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("device.automation")]
    public Optional<double?> DeviceAutomation { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("device.invalid")]
    public Optional<double?> DeviceInvalid { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("login.new_country")]
    public Optional<double?> LoginNewCountry { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("login.new_network")]
    public Optional<double?> LoginNewNetwork { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("captcha.failed")]
    public Optional<double?> CaptchaFailed { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("captcha.missing")]
    public Optional<double?> CaptchaMissing { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("content.spam")]
    public Optional<double?> ContentSpam { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("content.phishing")]
    public Optional<double?> ContentPhishing { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("content.malware")]
    public Optional<double?> ContentMalware { get; set; }

    /// <summary>
    /// This reason's new weight. `null` restores its default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("content.fraud")]
    public Optional<double?> ContentFraud { get; set; }

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
