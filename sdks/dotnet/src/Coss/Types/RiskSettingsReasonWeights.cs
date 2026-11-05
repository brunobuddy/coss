using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Reasons whose weight this environment changed (from calibration or by hand); the rest weigh what the reason catalog says.
/// </summary>
[Serializable]
public record RiskSettingsReasonWeights : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("email.invalid")]
    public double? EmailInvalid { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("email.disposable")]
    public double? EmailDisposable { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("email.undeliverable")]
    public double? EmailUndeliverable { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("email.role_account")]
    public double? EmailRoleAccount { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("email.typo")]
    public double? EmailTypo { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("email.domain_new")]
    public double? EmailDomainNew { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("ip.tor")]
    public double? IpTor { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("ip.vpn_network")]
    public double? IpVpnNetwork { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("ip.hosting_provider")]
    public double? IpHostingProvider { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("ip.vpn")]
    public double? IpVpn { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("ip.proxy")]
    public double? IpProxy { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("ip.relay")]
    public double? IpRelay { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("ip.private")]
    public double? IpPrivate { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.signups_per_ip_1h")]
    public double? VelocitySignupsPerIp1H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.signups_per_ip_24h")]
    public double? VelocitySignupsPerIp24H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.signups_per_subnet_1h")]
    public double? VelocitySignupsPerSubnet1H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.signups_per_email_domain_1h")]
    public double? VelocitySignupsPerEmailDomain1H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.signups_per_mailbox_24h")]
    public double? VelocitySignupsPerMailbox24H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.signups_per_device_24h")]
    public double? VelocitySignupsPerDevice24H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.checkouts_per_ip_1h")]
    public double? VelocityCheckoutsPerIp1H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.checkouts_per_user_1h")]
    public double? VelocityCheckoutsPerUser1H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.checkouts_per_card_24h")]
    public double? VelocityCheckoutsPerCard24H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.logins_per_ip_1h")]
    public double? VelocityLoginsPerIp1H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.logins_per_user_1h")]
    public double? VelocityLoginsPerUser1H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.events_per_ip_1h")]
    public double? VelocityEventsPerIp1H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("velocity.events_per_user_1h")]
    public double? VelocityEventsPerUser1H { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("duplicate.canonical_mailbox")]
    public double? DuplicateCanonicalMailbox { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("duplicate.device")]
    public double? DuplicateDevice { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("history.fraud_mailbox")]
    public double? HistoryFraudMailbox { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("history.fraud_user")]
    public double? HistoryFraudUser { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("history.fraud_ip")]
    public double? HistoryFraudIp { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("history.fraud_subnet")]
    public double? HistoryFraudSubnet { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("history.fraud_card")]
    public double? HistoryFraudCard { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("history.fraud_device")]
    public double? HistoryFraudDevice { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("checkout.card_country_mismatch")]
    public double? CheckoutCardCountryMismatch { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("checkout.billing_country_mismatch")]
    public double? CheckoutBillingCountryMismatch { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("checkout.prepaid_card")]
    public double? CheckoutPrepaidCard { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("device.automation")]
    public double? DeviceAutomation { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("device.invalid")]
    public double? DeviceInvalid { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("login.new_country")]
    public double? LoginNewCountry { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("login.new_network")]
    public double? LoginNewNetwork { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("captcha.failed")]
    public double? CaptchaFailed { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("captcha.missing")]
    public double? CaptchaMissing { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("content.spam")]
    public double? ContentSpam { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("content.phishing")]
    public double? ContentPhishing { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("content.malware")]
    public double? ContentMalware { get; set; }

    /// <summary>
    /// This reason's weight in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("content.fraud")]
    public double? ContentFraud { get; set; }

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
