using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// An environment's Verify settings.
/// </summary>
[Serializable]
public record VerifySettings : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required VerifySettingsObject Object { get; set; }

    /// <summary>
    /// The name codes are sent for.
    /// </summary>
    [JsonPropertyName("app_name")]
    public required string AppName { get; set; }

    /// <summary>
    /// Whether `app_name` is the project's: no name of its own is set.
    /// </summary>
    [JsonPropertyName("app_name_is_default")]
    public required bool AppNameIsDefault { get; set; }

    /// <summary>
    /// Digits in a code.
    /// </summary>
    [JsonPropertyName("code_length")]
    public required long CodeLength { get; set; }

    /// <summary>
    /// How long a code works.
    /// </summary>
    [JsonPropertyName("ttl_seconds")]
    public required long TtlSeconds { get; set; }

    /// <summary>
    /// Wrong codes before a verification fails.
    /// </summary>
    [JsonPropertyName("max_attempts")]
    public required long MaxAttempts { get; set; }

    /// <summary>
    /// One of the organization's numbers; `null`: coss.com's shared numbers.
    /// </summary>
    [Nullable]
    [JsonPropertyName("sms_from")]
    public string? SmsFrom { get; set; }

    /// <summary>
    /// An address on one of the organization's verified domains; `null`: coss.com's.
    /// </summary>
    [Nullable]
    [JsonPropertyName("email_from")]
    public string? EmailFrom { get; set; }

    /// <summary>
    /// ISO 3166 countries SMS codes may go to.
    /// </summary>
    [JsonPropertyName("allowed_countries")]
    public IEnumerable<string> AllowedCountries { get; set; } = new List<string>();

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
