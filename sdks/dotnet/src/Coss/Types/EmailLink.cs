using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record EmailLink : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required EmailLinkObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The email's id.
    /// </summary>
    [JsonPropertyName("email_id")]
    public required string EmailId { get; set; }

    /// <summary>
    /// Index of the link among the tracked links.
    /// </summary>
    [JsonPropertyName("position")]
    public required long Position { get; set; }

    /// <summary>
    /// The original link.
    /// </summary>
    [JsonPropertyName("url")]
    public required string Url { get; set; }

    /// <summary>
    /// Times it was clicked. Link scanners inflate it.
    /// </summary>
    [JsonPropertyName("click_count")]
    public required long ClickCount { get; set; }

    /// <summary>
    /// When it was first clicked. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("first_clicked_at")]
    public DateTime? FirstClickedAt { get; set; }

    /// <summary>
    /// When it was last clicked. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last_clicked_at")]
    public DateTime? LastClickedAt { get; set; }

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
