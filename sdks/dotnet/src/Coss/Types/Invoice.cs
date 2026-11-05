using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record Invoice : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required InvoiceObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The invoice number. `null` until it's finalized.
    /// </summary>
    [Nullable]
    [JsonPropertyName("number")]
    public string? Number { get; set; }

    /// <summary>
    /// `period`: a billing month. `plan_change`: a change of plan. `one_off`: a single charge. `final`: the last invoice of an account. `threshold`: usage charged early, taken off the month's invoice.
    /// </summary>
    [JsonPropertyName("kind")]
    public required InvoiceKind Kind { get; set; }

    /// <summary>
    /// `open`: not paid yet. `paid`: settled. `void`: canceled. `uncollectible`: written off.
    /// </summary>
    [JsonPropertyName("status")]
    public required InvoiceStatus Status { get; set; }

    /// <summary>
    /// Always `usd`.
    /// </summary>
    [JsonPropertyName("currency")]
    public required InvoiceCurrency Currency { get; set; }

    /// <summary>
    /// What period it covers.
    /// </summary>
    [JsonPropertyName("period")]
    public required InvoicePeriod Period { get; set; }

    /// <summary>
    /// An amount in cents (USD).
    /// </summary>
    [JsonPropertyName("subtotal")]
    public required long Subtotal { get; set; }

    /// <summary>
    /// An amount in cents (USD).
    /// </summary>
    [JsonPropertyName("discount")]
    public required long Discount { get; set; }

    /// <summary>
    /// An amount in cents (USD).
    /// </summary>
    [JsonPropertyName("credit")]
    public required long Credit { get; set; }

    /// <summary>
    /// An amount in cents (USD).
    /// </summary>
    [JsonPropertyName("tax")]
    public required long Tax { get; set; }

    /// <summary>
    /// An amount in cents (USD).
    /// </summary>
    [JsonPropertyName("total")]
    public required long Total { get; set; }

    /// <summary>
    /// An amount in cents (USD).
    /// </summary>
    [JsonPropertyName("amount_paid")]
    public required long AmountPaid { get; set; }

    /// <summary>
    /// An amount in cents (USD).
    /// </summary>
    [JsonPropertyName("amount_due")]
    public required long AmountDue { get; set; }

    /// <summary>
    /// `charge_automatically`: charged to the payment method. `send_invoice`: paid by `due_at`.
    /// </summary>
    [JsonPropertyName("collection_method")]
    public required InvoiceCollectionMethod CollectionMethod { get; set; }

    /// <summary>
    /// When payment is due. `null`: not set.
    /// </summary>
    [Nullable]
    [JsonPropertyName("due_at")]
    public DateTime? DueAt { get; set; }

    /// <summary>
    /// When it was finalized. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("finalized_at")]
    public DateTime? FinalizedAt { get; set; }

    /// <summary>
    /// When it was paid. `null`: not paid.
    /// </summary>
    [Nullable]
    [JsonPropertyName("paid_at")]
    public DateTime? PaidAt { get; set; }

    /// <summary>
    /// When it was voided. `null`: it wasn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("voided_at")]
    public DateTime? VoidedAt { get; set; }

    /// <summary>
    /// A page to view (and pay) the invoice.
    /// </summary>
    [Nullable]
    [JsonPropertyName("hosted_url")]
    public string? HostedUrl { get; set; }

    /// <summary>
    /// The invoice as a PDF. `null`: not available.
    /// </summary>
    [Nullable]
    [JsonPropertyName("pdf_url")]
    public string? PdfUrl { get; set; }

    [JsonPropertyName("lines")]
    public IEnumerable<InvoiceLine> Lines { get; set; } = new List<InvoiceLine>();

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
