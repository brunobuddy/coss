using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Verify;

[Serializable]
public record UpdateVerifySettingsRequest
{
    /// <summary>
    /// The name codes are sent for; `null`: the project's.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("app_name")]
    public Optional<string?> AppName { get; set; }

    /// <summary>
    /// Digits in a code, 4-10.
    /// </summary>
    [Optional]
    [JsonPropertyName("code_length")]
    public int? CodeLength { get; set; }

    /// <summary>
    /// How long a code works, 60-1800 s.
    /// </summary>
    [Optional]
    [JsonPropertyName("ttl_seconds")]
    public int? TtlSeconds { get; set; }

    /// <summary>
    /// Wrong codes before a verification fails, 1-10.
    /// </summary>
    [Optional]
    [JsonPropertyName("max_attempts")]
    public int? MaxAttempts { get; set; }

    /// <summary>
    /// One of the organization's numbers; `null`: coss.com's shared numbers.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("sms_from")]
    public Optional<string?> SmsFrom { get; set; }

    /// <summary>
    /// An address on one of the organization's verified domains (live keys); `null`: coss.com's.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("email_from")]
    public Optional<string?> EmailFrom { get; set; }

    /// <summary>
    /// ISO 3166 countries SMS codes may go to.
    /// </summary>
    [Optional]
    [JsonPropertyName("allowed_countries")]
    public IEnumerable<string>? AllowedCountries { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
