using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record LogDrainWithSecret : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required LogDrainWithSecretObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// Where batches are posted.
    /// </summary>
    [JsonPropertyName("url")]
    public required string Url { get; set; }

    /// <summary>
    /// Your note about it. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    /// <summary>
    /// What the drain forwards: `api` (requests made with the environment's API keys), `email` (email events), `webhook` (webhook delivery attempts) and `audit` (changes to the environment, from the organization's audit log). An empty array means every source, including ones added later.
    /// </summary>
    [JsonPropertyName("sources")]
    public IEnumerable<LogDrainSource> Sources { get; set; } = new List<LogDrainSource>();

    [JsonPropertyName("format")]
    public required LogDrainFormat Format { get; set; }

    /// <summary>
    /// The header sent with every batch to authenticate it (e.g. `Authorization`, `DD-API-KEY`), or `null`. Its value is never returned.
    /// </summary>
    [Nullable]
    [JsonPropertyName("auth_header_name")]
    public string? AuthHeaderName { get; set; }

    /// <summary>
    /// A disabled drain receives nothing, and lines logged while it is disabled are not kept for it.
    /// </summary>
    [JsonPropertyName("enabled")]
    public required bool Enabled { get; set; }

    /// <summary>
    /// `manual`: someone disabled it. `failing`: a batch failed every attempt, so coss.com disabled it. `null` while enabled.
    /// </summary>
    [Nullable]
    [JsonPropertyName("disabled_reason")]
    public LogDrainWithSecretDisabledReason? DisabledReason { get; set; }

    /// <summary>
    /// When it was disabled. `null` while enabled.
    /// </summary>
    [Nullable]
    [JsonPropertyName("disabled_at")]
    public DateTime? DisabledAt { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required DateTime UpdatedAt { get; set; }

    /// <summary>
    /// The drain's `whsec_…` signing secret, used to verify the batches coss.com sends. Returned only when the drain is created — store it now; it cannot be read back through the API.
    /// </summary>
    [JsonPropertyName("secret")]
    public required string Secret { get; set; }

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
