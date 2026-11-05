using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record Credit : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required CreditObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// `amount`: dollars (`amount` and `remaining` in cents); `units`: free units of `meter`.
    /// </summary>
    [JsonPropertyName("kind")]
    public required CreditKind Kind { get; set; }

    /// <summary>
    /// How much was granted: cents, or units for a `units` credit.
    /// </summary>
    [JsonPropertyName("amount")]
    public required long Amount { get; set; }

    /// <summary>
    /// How much is left, in the same unit as `amount`.
    /// </summary>
    [JsonPropertyName("remaining")]
    public required long Remaining { get; set; }

    /// <summary>
    /// What a `units` credit covers.
    /// </summary>
    [Nullable]
    [JsonPropertyName("meter")]
    public CreditMeter? Meter { get; set; }

    /// <summary>
    /// What an `amount` credit pays for (`null`: any usage).
    /// </summary>
    [Nullable]
    [JsonPropertyName("meters")]
    public IEnumerable<CreditMetersItem>? Meters { get; set; }

    /// <summary>
    /// `any`: also fees and other charges.
    /// </summary>
    [JsonPropertyName("applies_to")]
    public required CreditAppliesTo AppliesTo { get; set; }

    /// <summary>
    /// Where it came from: `fee`, `commitment`, `support`, `promotion`, `refund` or `sla`.
    /// </summary>
    [JsonPropertyName("source")]
    public required CreditSource Source { get; set; }

    /// <summary>
    /// What it's for.
    /// </summary>
    [JsonPropertyName("description")]
    public required string Description { get; set; }

    /// <summary>
    /// When it can start being used.
    /// </summary>
    [JsonPropertyName("effective_at")]
    public required DateTime EffectiveAt { get; set; }

    /// <summary>
    /// When what's left expires. `null`: never.
    /// </summary>
    [Nullable]
    [JsonPropertyName("expires_at")]
    public DateTime? ExpiresAt { get; set; }

    /// <summary>
    /// When it was voided. `null`: it wasn't.
    /// </summary>
    [Nullable]
    [JsonPropertyName("voided_at")]
    public DateTime? VoidedAt { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

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
