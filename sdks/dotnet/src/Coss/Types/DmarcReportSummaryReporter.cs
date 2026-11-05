using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Who sent the report.
/// </summary>
[Serializable]
public record DmarcReportSummaryReporter : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The reporting organization.
    /// </summary>
    [JsonPropertyName("org_name")]
    public required string OrgName { get; set; }

    /// <summary>
    /// Its contact address.
    /// </summary>
    [Nullable]
    [JsonPropertyName("email")]
    public string? Email { get; set; }

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
