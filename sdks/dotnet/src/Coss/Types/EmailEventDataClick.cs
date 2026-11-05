using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Only for `email.clicked`.
/// </summary>
[Serializable]
public record EmailEventDataClick : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The original link that was clicked.
    /// </summary>
    [JsonPropertyName("url")]
    public required string Url { get; set; }

    /// <summary>
    /// Index of the link among the email's tracked links.
    /// </summary>
    [JsonPropertyName("link_position")]
    public required long LinkPosition { get; set; }

    /// <summary>
    /// The client's `User-Agent`. `null`: not sent.
    /// </summary>
    [Nullable]
    [JsonPropertyName("user_agent")]
    public string? UserAgent { get; set; }

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
