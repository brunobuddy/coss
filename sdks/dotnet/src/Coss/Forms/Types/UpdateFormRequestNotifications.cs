using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Emails about accepted submissions. Only the fields given change.
/// </summary>
[Serializable]
public record UpdateFormRequestNotifications : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Who gets an email for each accepted submission: members of your organization, or addresses on its verified domains.
    /// </summary>
    [Optional]
    [JsonPropertyName("recipients")]
    public IEnumerable<string>? Recipients { get; set; }

    /// <summary>
    /// The notification's sender, on a verified domain in live environments. `null`: coss.com, as "&lt;form name&gt; via coss.com".
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("from")]
    public Optional<string?> From { get; set; }

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
