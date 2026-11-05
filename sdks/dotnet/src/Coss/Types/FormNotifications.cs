using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Emails about accepted submissions.
/// </summary>
[Serializable]
public record FormNotifications : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Who gets an email for each accepted submission.
    /// </summary>
    [JsonPropertyName("recipients")]
    public IEnumerable<string> Recipients { get; set; } = new List<string>();

    /// <summary>
    /// The notification's sender. `null`: coss.com, as "&lt;form name&gt; via coss.com".
    /// </summary>
    [Nullable]
    [JsonPropertyName("from")]
    public string? From { get; set; }

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
