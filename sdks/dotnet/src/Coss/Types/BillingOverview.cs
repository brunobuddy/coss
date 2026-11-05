using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record BillingOverview : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required BillingOverviewObject Object { get; set; }

    /// <summary>
    /// The organization's id.
    /// </summary>
    [JsonPropertyName("organization_id")]
    public required string OrganizationId { get; set; }

    /// <summary>
    /// The plan in effect now (`free` without a contract).
    /// </summary>
    [JsonPropertyName("plan")]
    public required BillingOverviewPlan Plan { get; set; }

    /// <summary>
    /// The contract in effect; `null` on the Free plan.
    /// </summary>
    [Nullable]
    [JsonPropertyName("contract")]
    public BillingOverviewContract? Contract { get; set; }

    /// <summary>
    /// A plan change that takes effect later (a downgrade, a cancellation).
    /// </summary>
    [Nullable]
    [JsonPropertyName("scheduled_change")]
    public BillingOverviewScheduledChange? ScheduledChange { get; set; }

    /// <summary>
    /// `past_due`: an invoice is overdue; `delinquent`: past its grace period, and live sending is held.
    /// </summary>
    [JsonPropertyName("status")]
    public required BillingOverviewStatus Status { get; set; }

    /// <summary>
    /// Billing holds on live sending (sandbox keys keep working).
    /// </summary>
    [JsonPropertyName("holds")]
    public IEnumerable<BillingOverviewHoldsItem> Holds { get; set; } =
        new List<BillingOverviewHoldsItem>();

    /// <summary>
    /// Always `usd`.
    /// </summary>
    [JsonPropertyName("currency")]
    public required BillingOverviewCurrency Currency { get; set; }

    /// <summary>
    /// The current billing month (UTC).
    /// </summary>
    [JsonPropertyName("period")]
    public required BillingOverviewPeriod Period { get; set; }

    /// <summary>
    /// This month's usage per meter.
    /// </summary>
    [JsonPropertyName("usage")]
    public IEnumerable<BillingOverviewUsageItem> Usage { get; set; } =
        new List<BillingOverviewUsageItem>();

    /// <summary>
    /// This month so far, as it would be invoiced if it ended now.
    /// </summary>
    [JsonPropertyName("estimate")]
    public required BillingOverviewEstimate Estimate { get; set; }

    /// <summary>
    /// Unused credit usable this month.
    /// </summary>
    [JsonPropertyName("credit_remaining")]
    public required long CreditRemaining { get; set; }

    /// <summary>
    /// Usage beyond the credit past which live sending is held; `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("spend_limit")]
    public long? SpendLimit { get; set; }

    /// <summary>
    /// Where the organization stands against its credit limit; `null`: it has none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("credit_limit")]
    public BillingOverviewCreditLimit? CreditLimit { get; set; }

    /// <summary>
    /// The payment method on file. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("payment_method")]
    public BillingOverviewPaymentMethod? PaymentMethod { get; set; }

    /// <summary>
    /// Add-ons of the contract in effect, charged on top of the plan.
    /// </summary>
    [JsonPropertyName("add_ons")]
    public IEnumerable<BillingOverviewAddOnsItem> AddOns { get; set; } =
        new List<BillingOverviewAddOnsItem>();

    /// <summary>
    /// Which features the plan includes.
    /// </summary>
    [JsonPropertyName("features")]
    public required BillingOverviewFeatures Features { get; set; }

    /// <summary>
    /// Resource limits (`null`: unlimited).
    /// </summary>
    [JsonPropertyName("limits")]
    public required BillingOverviewLimits Limits { get; set; }

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
