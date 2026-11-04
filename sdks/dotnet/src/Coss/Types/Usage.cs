using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record Usage : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required UsageObject Object { get; set; }

    /// <summary>
    /// What is counted, e.g. `email.recipients`.
    /// </summary>
    [JsonPropertyName("meter")]
    public required UsageMeter Meter { get; set; }

    /// <summary>
    /// e.g. `country=US` for SMS; `null` for none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("dimension")]
    public string? Dimension { get; set; }

    /// <summary>
    /// Set with `group_by=environment`; `null` there for organization-wide usage (SMS numbers and registration fees).
    /// </summary>
    [Nullable]
    [JsonPropertyName("environment_id")]
    public string? EnvironmentId { get; set; }

    /// <summary>
    /// Set with `group_by=project` (`null`: organization-wide usage, or usage recorded before projects were).
    /// </summary>
    [Nullable]
    [JsonPropertyName("project_id")]
    public string? ProjectId { get; set; }

    /// <summary>
    /// Set with `group_by=api_key` (`null`: the dashboard, or usage recorded before keys were).
    /// </summary>
    [Nullable]
    [JsonPropertyName("api_key_id")]
    public string? ApiKeyId { get; set; }

    /// <summary>
    /// Set with `group_by=user`: the member whose personal API key caused it (`null`: organization keys and the dashboard).
    /// </summary>
    [Nullable]
    [JsonPropertyName("user_id")]
    public string? UserId { get; set; }

    /// <summary>
    /// When this bucket starts (inclusive).
    /// </summary>
    [JsonPropertyName("start")]
    public required DateTime Start { get; set; }

    /// <summary>
    /// When this bucket ends (exclusive).
    /// </summary>
    [JsonPropertyName("end")]
    public required DateTime End { get; set; }

    /// <summary>
    /// Units used in this bucket.
    /// </summary>
    [JsonPropertyName("quantity")]
    public required long Quantity { get; set; }

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
